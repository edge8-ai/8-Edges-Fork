// Every word on a training register (A.40; ADR 0016 and its 2026-10-12
// amendment). A register row's status is set by three voices: the member, the
// organiser, and a transcript's reading. Before this module each had its own
// writer with its own checks, and two of them disagreed: the member's answer
// never recorded its source, so the next transcript reading overwrote it, and
// the member's confirm skipped the seven-day window. Now every status write and
// every review write goes through here, and the rules live in two pure steps
// the writers below only carry out: decide, for what a voice does to a row's
// status, and mayReview, for the member's review. Both ask the same member's
// gate, so the window cannot mean one thing for a word and another for a review.
//
// The rules (Khoa, 2026-10-13, grilled as Q1-Q16):
// - each voice writes its own source: member, organiser or transcript;
// - a transcript fills a pending row and re-reads its own earlier reading, but
//   never replaces a person's word;
// - between the member and the organiser, the last word stands;
// - the member's word is open from the start until the window closes, and the
//   organiser's is not bound by the window;
// - a word about yourself is always the member's word, so an organiser cannot
//   use their door on their own row (every self-logged training is one);
// - a member moving off attended removes their own review first; an organiser
//   cannot move a reviewed row off attended, because the review is the member's.
//
// Rows are named by a RowKey, (training, person), which the table keeps unique,
// and the person always comes from the caller's guard. Reads raise on failure
// (rule 2): an empty answer would read as "not found".
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { GREETING_COLUMNS, greetingName, legalName, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { matchRoster } from "./transcript-attendance";
import { windowStart, wordOpen, type AnswerInputType, type AttendanceSource, type AttendanceStatus, type ReviewInputType, type SkipReason } from "./training-rules";

/** A register row's key: one person on one training. */
export type RowKey = { trainingId: string; personId: string };

/** One register row as the pure steps need it. */
export type RegisterRow = {
  personId: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  reviewed: boolean;
  training: { organiserId: string; startsAt: string; endsAt: string; cancelledAt: string | null; selfLogged: boolean; loggedAt: string };
};

/** Who speaks: the member about their own row, the organiser about a learner, or a transcript. */
export type Voice = { member: string } | { organiser: string } | "transcript";

/** What the register itself records: someone was there or was not. The organiser and a transcript say only this. */
export type RegisterSaid = { status: "attended" } | { status: "absent" };

/** What the member may say, which adds skipping with a reason. */
export type Said = RegisterSaid | { status: "skipped"; reason: SkipReason | null };

export type WordPatch = { status: AttendanceStatus; source: AttendanceSource; skip_reason: SkipReason | null; answered_at: string };

export type Decision = { write: WordPatch; dropReview: boolean } | { keep: true } | { refuse: string };

/**
 * A row with no word on it yet: the shape a person has when they are put back
 * on a session. The source is "member" because that is the column's default,
 * the source of a row nobody has spoken on, and decide reads a pending member
 * row as one a transcript may still fill. It belongs to the register's rules,
 * so the code that changes who is on a session spreads it rather than spelling
 * a status of its own.
 */
export const BLANK_WORD = { status: "pending" as AttendanceStatus, source: "member" as AttendanceSource, skip_reason: null, answered_at: null };

const NOT_FOUND = "That training was not found.";
const FINAL = "That one is final now.";
const SAVE_FAILED = "Could not save that. Try again.";
const REVIEWED = "This learner reviewed the session, so it stays attended. Ask them to change it.";

const started = (row: RegisterRow, now: Date) => new Date(row.training.startsAt).getTime() <= now.getTime();

/**
 * The member's gate, asked by every word and review of theirs: their own row,
 * a session that was not cancelled and has started, inside its window. Returns
 * the refusal, or null when they may speak.
 */
function memberRefusal(row: RegisterRow, personId: string, now: Date): string | null {
  if (row.training.cancelledAt || row.personId !== personId) return NOT_FOUND;
  if (!started(row, now)) return "You can say once it has started.";
  const t = row.training;
  if (!wordOpen(windowStart({ endsAt: t.endsAt, selfLogged: t.selfLogged, loggedAt: t.loggedAt }), now)) return FINAL;
  return null;
}

/**
 * The register's rules for a row's status: what a voice saying something does
 * to it. Exported for its own tests; the writers in this file are its only
 * production callers, and the rail test refuses a status write anywhere else.
 * The overloads hold the rule that only the member may say skipped.
 */
export function decide(row: RegisterRow, voice: { member: string }, said: Said, now: Date): Decision;
export function decide(row: RegisterRow, voice: { organiser: string } | "transcript", said: RegisterSaid, now: Date): Decision;
export function decide(row: RegisterRow, voice: Voice, said: Said, now: Date): Decision {
  const patch = (source: AttendanceSource): WordPatch => ({
    status: said.status,
    source,
    skip_reason: said.status === "skipped" ? said.reason : null,
    answered_at: now.toISOString(),
  });
  if (voice === "transcript") {
    if (row.source === "organiser") return { keep: true };
    if (row.source === "member" && row.status !== "pending") return { keep: true };
    if (row.source === "transcript" && row.status === said.status) return { keep: true };
    return { write: patch("transcript"), dropReview: false };
  }
  if ("member" in voice) {
    const refusal = memberRefusal(row, voice.member, now);
    if (refusal) return { refuse: refusal };
    // A review exists only on an attended row, and the database refuses to move
    // a reviewed row off attended (training_reviews_attended_only), so the
    // member's move off attended removes their review first (Khoa, 2026-10-12).
    return { write: patch("member"), dropReview: row.reviewed && said.status !== "attended" };
  }
  if (row.training.cancelledAt) return { refuse: NOT_FOUND };
  if (row.training.organiserId !== voice.organiser) return { refuse: "You can correct only a session you run." };
  if (row.personId === voice.organiser) return { refuse: "A word about yourself is yours to give on My Training." };
  if (!started(row, now)) return { refuse: "The session has not started." };
  if (row.reviewed && said.status !== "attended") return { refuse: REVIEWED };
  return { write: patch("organiser"), dropReview: false };
}

/**
 * Whether the member may save or remove their review: the member's gate, and,
 * to save one, a row that says they went. Returns the refusal, or null.
 */
export function mayReview(row: RegisterRow, personId: string, act: "save" | "remove", now: Date): string | null {
  const refusal = memberRefusal(row, personId, now);
  if (refusal) return refusal;
  if (act === "save" && row.status !== "attended") return "Say you went first.";
  return null;
}

// ── reading and writing ──────────────────────────────────────────────────────

const ROW_COLUMNS =
  "id, person_id, status, source, reviews:training_reviews!training_reviews_attended_only(id), training:trainings!inner(organiser_id, starts_at, ends_at, cancelled_at, self_logged, created_at)";

type DbRow = {
  id: string;
  person_id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  reviews: { id: string }[] | null;
  training: { organiser_id: string; starts_at: string; ends_at: string; cancelled_at: string | null; self_logged: boolean; created_at: string } | null;
};

function toRow(r: DbRow): RegisterRow | null {
  if (!r.training) return null;
  const t = r.training;
  return {
    personId: r.person_id,
    status: r.status,
    source: r.source,
    reviewed: (r.reviews ?? []).length > 0,
    training: { organiserId: t.organiser_id, startsAt: t.starts_at, endsAt: t.ends_at, cancelledAt: t.cancelled_at, selfLogged: t.self_logged, loggedAt: t.created_at },
  };
}

/** The live row under this key, or null. */
async function readRow(key: RowKey): Promise<{ id: string; row: RegisterRow } | null> {
  const rows = mustRows(
    await companyOs.from("training_attendance").select(ROW_COLUMNS).eq("training_id", key.trainingId).eq("person_id", key.personId).is("removed_at", null).limit(1),
    "[training] register row",
  ) as unknown as DbRow[];
  const r = rows[0];
  const row = r ? toRow(r) : null;
  return r && row ? { id: r.id, row } : null;
}

/**
 * Carries out a person's decision. The review goes first when it must: if its
 * removal fails nothing has changed; if it succeeds and the status write then
 * fails, the member is still marked attended without a review, the training
 * returns to their tray, and they are told it did not save.
 */
async function carryOut(id: string, key: RowKey, decision: Decision): Promise<Result> {
  if ("refuse" in decision) return { ok: false, error: decision.refuse };
  if ("keep" in decision) return { ok: true };
  if (decision.dropReview) {
    const { error } = await companyOs.from("training_reviews").delete().eq("attendance_id", id);
    if (error) return { ok: false, error: SAVE_FAILED };
  }
  // The read's conditions are repeated on the write, so a removal that lands
  // between the two cannot be answered.
  const { error } = await companyOs.from("training_attendance").update(decision.write).eq("id", id).eq("person_id", key.personId).is("removed_at", null);
  // 23503 is the review's foreign key: a review was saved after the read. Only
  // the organiser's correction can meet it, since the member's drops theirs first.
  if (error) return { ok: false, error: error.code === "23503" ? REVIEWED : SAVE_FAILED };
  return { ok: true };
}

/** What the member's buttons can say: My Training's answer, or the confirm's "I was not". */
export type MemberWord = AnswerInputType | { answer: "absent" };

/** The member's own word on a training they are on, by either door. key.personId is the member. */
export async function memberSays(key: RowKey, word: MemberWord, now: Date): Promise<Result> {
  const found = await readRow(key);
  if (!found) return { ok: false, error: NOT_FOUND };
  const said: Said = word.answer === "skipped" ? { status: "skipped", reason: word.reason } : { status: word.answer };
  return carryOut(found.id, key, decide(found.row, { member: key.personId }, said, now));
}

/** The organiser corrects a learner's row on a session they run. key.personId is the learner. */
export async function organiserCorrects(organiserId: string, key: RowKey, status: RegisterSaid["status"], now: Date): Promise<Result> {
  const found = await readRow(key);
  if (!found) return { ok: false, error: NOT_FOUND };
  return carryOut(found.id, key, decide(found.row, { organiser: organiserId }, { status }, now));
}

type RegisterWithNames = DbRow & { person: GreetedPerson | null };

/**
 * A transcript's reading of the whole register: who it heard speak is
 * attended, everyone else absent, and decide keeps every person's word.
 * answered_at is the time of this reading, which the table's shape check
 * requires on any row that is not pending. `changed` counts the rows actually
 * written.
 */
export async function transcriptHeard(trainingId: string, speakers: readonly string[], now: Date): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const register = mustRows(
    await companyOs.from("training_attendance").select(`${ROW_COLUMNS}, person:people!training_attendance_person_id_fkey(${GREETING_COLUMNS})`).eq("training_id", trainingId).is("removed_at", null),
    "[training] session register",
  ) as unknown as RegisterWithNames[];
  const heard = matchRoster(
    speakers,
    // Every name the directory holds for them, each through the one module that decides names.
    register.map((r) => ({ id: r.person_id, names: r.person ? [personName(r.person, null), legalName(r.person, null), greetingName(r.person, null)] : [] })),
  );
  let changed = 0;
  for (const r of register) {
    const row = toRow(r);
    if (!row) continue;
    const decision = decide(row, "transcript", { status: heard.get(r.person_id) ?? "absent" }, now);
    if (!("write" in decision)) continue;
    // The row's word and its place on the register are repeated on the write,
    // so a person who speaks, or is taken off, between the read and this write
    // is not overwritten by a reading that never saw it. Such a row matches
    // nothing, and is not counted.
    const { data, error } = await companyOs
      .from("training_attendance")
      .update(decision.write)
      .eq("id", r.id)
      .eq("status", r.status)
      .eq("source", r.source)
      .is("removed_at", null)
      .select("id");
    if (error) return { ok: false, error: `Could not set attendance for a learner: ${error.message}` };
    changed += (data ?? []).length;
  }
  return { ok: true, changed };
}

/**
 * Saves the member's review of a training they went to, inside its window. One
 * review per register row: a second save is an edit. key.personId is the member.
 */
export async function saveReview(key: RowKey, input: ReviewInputType, now: Date): Promise<Result> {
  const found = await readRow(key);
  if (!found) return { ok: false, error: NOT_FOUND };
  const refusal = mayReview(found.row, key.personId, "save", now);
  if (refusal) return { ok: false, error: refusal };
  const { error } = await companyOs
    .from("training_reviews")
    .upsert({ attendance_id: found.id, stars: input.stars, load: input.load, tags: input.tags, note: input.note, signed: input.signed }, { onConflict: "attendance_id" });
  if (error) return { ok: false, error: "Could not save your review. Try again." };
  return { ok: true };
}

/** Removes the member's review inside its window; the row is deleted, as "remove" means gone (Khoa, 2026-10-12). */
export async function removeReview(key: RowKey, now: Date): Promise<Result> {
  const found = await readRow(key);
  if (!found) return { ok: false, error: NOT_FOUND };
  const refusal = mayReview(found.row, key.personId, "remove", now);
  if (refusal) return { ok: false, error: refusal };
  const { error } = await companyOs.from("training_reviews").delete().eq("attendance_id", found.id);
  if (error) return { ok: false, error: "Could not remove it. Try again." };
  return { ok: true };
}
