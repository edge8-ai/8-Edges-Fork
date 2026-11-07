// Taught sessions and their seats (QS.5; quests spec "Raids and Training",
// "Burning fires and seats"): what Training's door offers another entity that
// wants a session taught by one of the team, without that entity ever writing
// a training table (ADR 0018) and without widening training.organise.
//
// - A taught session is an ordinary training of the "Sharing session" type,
//   organised by the person who will teach it. Organising one implies the
//   Host role (QS.5b, hostsATaughtSession), which holds training.host: the
//   session page and its register, move and cancel, never training.organise
//   (ADR 0013). mayRunSession keeps a Host to a taught session they organise,
//   so they run their own fire and no other session.
// - A seat is the person's own row on the session's register. It starts
//   pending, as every row does, and a seat left is a pending row marked
//   removed by the person themselves: the register never deletes a row (its
//   own rule, 20261011180000), and who removed it is what lets them sit again.
// - Who is by a fire is read from the register, not from anyone's word: a seat
//   shows while it is on the register, whatever the person later says about
//   going (ADR 0016, amended for QS.5), so no face ever vanishes on a skip.
// - Whether someone organises a session is asked of the session itself, so a
//   Raid's Host passes on their own session and on no other.
//
// The caller has already checked its own permission and names the person it
// acts for; every write here filters on that person, so one person can only
// ever sit, or leave, for themselves.
import { companyOs } from "@/kernel/data/supabase";
import { mustPages, mustPagesIn, mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { isUuid } from "@/kernel/config/slug";
import { BLANK_WORD } from "./attendance-word";
import { cancelTraining, listTypes } from "./trainings";

/** The training type every taught session is filed under; seeded in every install (20261011180000). */
export const TAUGHT_SESSION_TYPE = "Sharing session";

const NOT_FOUND = "That session was not found.";
const SEAT_FAILED = "Could not save your seat. Try again.";

/** What a taught session is created from: who teaches it, what it is called, when it starts and how long it lasts. */
export type TaughtSessionInput = { hostPersonId: string; title: string; startsAt: string; minutes: number };

/**
 * Creates a session taught by `hostPersonId`, who becomes its organiser. It
 * starts with nobody on its register: people take their own seats. Refused for
 * a time that has passed, a length outside five minutes to a day, or an
 * install whose Sharing session type has been retired.
 */
export async function createTaughtSession(input: TaughtSessionInput, now: Date = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  const start = Date.parse(input.startsAt);
  if (!title) return { ok: false, error: "Give the session a title." };
  if (Number.isNaN(start)) return { ok: false, error: "Pick a time for the session." };
  if (start <= now.getTime()) return { ok: false, error: "Pick a time that has not passed." };
  if (!Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 24 * 60) return { ok: false, error: "A session lasts between five minutes and a day." };
  const type = (await taughtTypes()).find((t) => !t.archived);
  if (!type) return { ok: false, error: `Training has no live "${TAUGHT_SESSION_TYPE}" type, so the session cannot be filed. Ask an admin to restore it.` };
  const startsAt = new Date(start).toISOString();
  const endsAt = new Date(start + input.minutes * 60_000).toISOString();
  const { data, error } = await companyOs
    .from("trainings")
    .insert({ type_id: type.id, title: title.slice(0, 200), starts_at: startsAt, ends_at: endsAt, organiser_id: input.hostPersonId, self_logged: false })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[training/taught] trainings insert", error?.message);
    return { ok: false, error: "Could not create the session. Try again." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * Cancels a taught session its host created a moment ago, for a caller whose
 * own next write failed: soft, like every end of a training, so the row stays
 * and shows nowhere. Only the session's organiser may, and only before it starts.
 */
export async function cancelTaughtSession(hostPersonId: string, trainingId: string, now: Date = new Date()): Promise<Result> {
  return cancelTraining(hostPersonId, trainingId, now);
}

/**
 * The per-session organiser check: whether this person organises this one
 * session. It is how a Raid's Host is known to run their session without
 * holding training.organise; a self-logged training has no organiser to ask
 * about. A failed read raises, because "no" here would be a wrong answer.
 */
export async function organisesSession(personId: string, trainingId: string): Promise<boolean> {
  const rows = mustRows(
    await companyOs.from("trainings").select("id").eq("id", trainingId).eq("organiser_id", personId).eq("self_logged", false).limit(1),
    "[training/taught] organiser",
  );
  return rows.length === 1;
}

/**
 * Every training type a taught session is filed under: the Sharing session
 * type matched by name without regard to case, retired or not. The one lookup
 * that creating a taught session, the Host role's fact and the per-session
 * check share, so a type renamed only in case cannot drop every Host, and a
 * retired type keeps the sessions already filed under it taught.
 */
async function taughtTypes(): Promise<{ id: string; archived: boolean }[]> {
  return (await listTypes({ withRetired: true })).filter((t) => t.name.toLowerCase() === TAUGHT_SESSION_TYPE.toLowerCase());
}

/**
 * The fact behind the implied Host role (QS.5b): whether this person organises
 * at least one taught session, put on the record for others and not cancelled,
 * whether or not it has ended, since the register is marked after. It decides
 * only that training.host is held; which session a Host may run is
 * mayRunSession's. A failed read raises, because the resolver must refuse
 * rather than quietly take the role away.
 */
export async function hostsATaughtSession(personId: string): Promise<boolean> {
  const types = await taughtTypes();
  if (types.length === 0) return false;
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id")
      .eq("organiser_id", personId)
      .eq("self_logged", false)
      .is("cancelled_at", null)
      .in("type_id", types.map((t) => t.id))
      .limit(1),
    "[training/taught] hosts",
  );
  return rows.length === 1;
}

/**
 * Whether this reader may run this one session from the organiser's page:
 * open it, mark its register, move it, cancel it (QS.5b). Someone holding
 * training.organise may run any session they organise, as before, and the
 * page's read and each write still filter on the organiser. Anyone else, a
 * Raid's Host through training.host, may run only a taught session they
 * organise for others: the glossary's "that one session and no other", so a
 * former organiser who now hosts one fire does not get their old trainings
 * back. An id that is not a uuid is nobody's session. A failed read raises.
 */
export async function mayRunSession(access: { may(permission: string): boolean }, personId: string, trainingId: string): Promise<boolean> {
  if (access.may("training.organise")) return true;
  if (!isUuid(trainingId)) return false;
  const types = await taughtTypes();
  if (types.length === 0) return false;
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id")
      .eq("id", trainingId)
      .eq("organiser_id", personId)
      .eq("self_logged", false)
      .in("type_id", types.map((t) => t.id))
      .limit(1),
    "[training/taught] runs",
  );
  return rows.length === 1;
}

/**
 * Whether a session is a taught session (the Sharing type, matched as
 * taughtTypes matches it), the kind a fire on Quests is lit as (QS.5c). The
 * session page asks it only to say, when cancelling, that a fire lit for it
 * goes out too; Training cannot ask Quests whether one was. A failed read raises.
 */
export async function isTaughtSession(trainingId: string): Promise<boolean> {
  if (!isUuid(trainingId)) return false;
  const types = await taughtTypes();
  if (types.length === 0) return false;
  const rows = mustRows(
    await companyOs.from("trainings").select("id").eq("id", trainingId).in("type_id", types.map((t) => t.id)).limit(1),
    "[training/taught] taught",
  );
  return rows.length === 1;
}

/** Where a session's organiser runs it: the organiser's session page. */
const organiserPagePath = (trainingId: string): string => `/team/training/sessions/${trainingId}`;

type SeatSession = { id: string; ends_at: string; cancelled_at: string | null; self_logged: boolean; attendance: { id: string; person_id: string; removed_at: string | null; removed_by: string | null }[] };

/** The session and the person's own register row on it, if any. A failed read raises. */
async function sessionFor(trainingId: string, personId: string): Promise<SeatSession | null> {
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id, ends_at, cancelled_at, self_logged, attendance:training_attendance(id, person_id, removed_at, removed_by)")
      .eq("id", trainingId)
      .eq("attendance.person_id", personId)
      .limit(1),
    "[training/taught] session",
  ) as unknown as SeatSession[];
  return rows[0] ?? null;
}

/**
 * Puts the person on the session's register, pending. Sitting again is a
 * no-op; a seat the person left themselves is put back with no word. A person
 * the organiser took off stays off: only the organiser undoes that, from the
 * plan page. Refused once the session has ended or was cancelled, and on a
 * training someone logged for themselves.
 */
export async function takeSeat(trainingId: string, personId: string, now: Date = new Date()): Promise<Result> {
  const s = await sessionFor(trainingId, personId);
  if (!s || s.self_logged) return { ok: false, error: NOT_FOUND };
  if (s.cancelled_at) return { ok: false, error: "That session was cancelled." };
  if (Date.parse(s.ends_at) <= now.getTime()) return { ok: false, error: "That session has ended." };
  const own = s.attendance.find((a) => a.person_id === personId);
  if (own && own.removed_at === null) return { ok: true };
  if (own && own.removed_by !== personId) return { ok: false, error: "The organiser took you off this session." };
  if (own) {
    const { error } = await companyOs
      .from("training_attendance")
      .update({ removed_at: null, removed_by: null, ...BLANK_WORD })
      .eq("id", own.id)
      .eq("person_id", personId);
    if (error) {
      console.error("[training/taught] seat put back", error.message);
      return { ok: false, error: SEAT_FAILED };
    }
    return { ok: true };
  }
  const { error } = await companyOs.from("training_attendance").insert({ training_id: trainingId, person_id: personId });
  // The register's one-row-per-person key is the last word on a double click.
  if (error?.code === "23505") return { ok: true };
  if (error) {
    console.error("[training/taught] seat insert", error.message);
    return { ok: false, error: SEAT_FAILED };
  }
  return { ok: true };
}

/**
 * Takes the person's seat away: their own pending row is marked removed, by
 * them, never deleted (the register's rule; `removed_at` is how a person is
 * taken off before a training starts). A row that already carries a word
 * (attended or skipped) is the register's record and stays; leaving a seat you
 * never took, or already left, is a no-op.
 */
export async function leaveSeat(trainingId: string, personId: string, now: Date = new Date()): Promise<Result> {
  const { error } = await companyOs
    .from("training_attendance")
    .update({ removed_at: now.toISOString(), removed_by: personId })
    .eq("training_id", trainingId)
    .eq("person_id", personId)
    .eq("status", "pending")
    .is("removed_at", null);
  if (error) {
    console.error("[training/taught] seat removed", error.message);
    return { ok: false, error: "Could not leave your seat. Try again." };
  }
  return { ok: true };
}

/** One taught session as a caller draws it: when, whether it was cancelled, who runs it, and who has a seat. */
export type TaughtSession = {
  startsAt: string;
  endsAt: string;
  cancelled: boolean;
  /** The person (company_os.people) who organises it: the one person its organiser's page finds it for (QS.5b). */
  organiserId: string;
  /** Where its organiser runs it, for a caller that links its organiser there: the page opens on training.host, which the implied Host role carries, and its read finds the session only for its organiser. */
  organiserPage: string;
  /** The people (company_os.people) with a seat: on the register and not taken off. Their word on going is never read here (ADR 0016). */
  seated: string[];
  /**
   * Its register has a mark (QS.5c): someone on it, not taken off, is marked
   * attended or absent, by the organiser, a transcript or their own word. A
   * pending row is no mark, and nor is a skip said ahead of time. Until then
   * an ended fire stays on Quests for its Host, to mark who came.
   */
  marked: boolean;
};

type SessionRow = { id: string; starts_at: string; ends_at: string; cancelled_at: string | null; organiser_id: string; attendance: { person_id: string; status: string; removed_at: string | null; created_at: string }[] };

/** Each session asked about, with its seats. A session Training does not know is absent from the map. A failed read raises. */
export async function taughtSessions(trainingIds: readonly string[]): Promise<Map<string, TaughtSession>> {
  const out = new Map<string, TaughtSession>();
  const rows = await mustPagesIn<SessionRow>(trainingIds, "[training/taught] sessions", (ids, from, to) =>
    companyOs.from("trainings").select("id, starts_at, ends_at, cancelled_at, organiser_id, attendance:training_attendance(person_id, status, removed_at, created_at)").in("id", ids).order("id").range(from, to),
  );
  for (const r of rows) {
    const seated = r.attendance
      .filter((a) => a.removed_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => a.person_id);
    out.set(r.id, { startsAt: r.starts_at, endsAt: r.ends_at, cancelled: r.cancelled_at !== null, organiserId: r.organiser_id, organiserPage: organiserPagePath(r.id), seated, marked: r.attendance.some((a) => a.removed_at === null && (a.status === "attended" || a.status === "absent")) });
  }
  return out;
}

/**
 * The sessions whose end falls after `from` and no later than `to`, cancelled
 * ones included (ADR 0023). The quest clock asks it each tick to find the
 * fires whose sessions just ended; whether one was held is Quests' to judge,
 * so Training answers only when each session ended. A failed read raises.
 */
export async function sessionsEndedBetween(from: Date, to: Date): Promise<string[]> {
  const rows = await mustPages<{ id: string }>("[training/taught] sessions ended", (start, end) =>
    companyOs.from("trainings").select("id").gt("ends_at", from.toISOString()).lte("ends_at", to.toISOString()).order("id").range(start, end),
  );
  return rows.map((r) => r.id);
}
