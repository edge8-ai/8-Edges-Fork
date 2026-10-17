// Trainings and attendance (TR.2): the entity's reads, and the organiser's and
// the type list's writes; every word on a register row, and every review, is
// in ./attendance-word (A.40). Each takes the person it acts for and filters on them in the
// query, so a member only ever answers for themselves and an organiser only ever
// changes what they organised. The actions above check the permission; these
// check the row. Reads raise on failure (rule 2): an empty list would tell a
// member they have nothing waiting when the read simply failed.
//
// What an organiser can see of a training is who is on it, never anyone's
// answer: attendance is counted only inside the programme read (ADR 0016).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { Result } from "@/kernel/data/result";
import { BLANK_WORD } from "./attendance-word";
import {
  organiserMay,
  saigonRange,
  type AttendanceSource,
  type AttendanceStatus,
  type LogInputType,
  type MyReview,
  type MyTrainingRow,
  type ScheduleInputType,
  type SkipReason,
  type UpdateInputType,
} from "./training-rules";

export type TrainingType = { id: string; name: string; rank: number; archived: boolean };

type TypeRow = { id: string; name: string; sort_order: number; archived_at: string | null };

/** The training types, in the order pickers show them; retired ones only when asked. */
export async function listTypes(opts: { withRetired?: boolean } = {}): Promise<TrainingType[]> {
  let q = companyOs.from("training_types").select("id, name, sort_order, archived_at").order("sort_order").order("name");
  if (!opts.withRetired) q = q.is("archived_at", null);
  const rows = mustRows(await q, "[training] types") as TypeRow[];
  return rows.map((r, i) => ({ id: r.id, name: r.name, rank: i, archived: r.archived_at !== null }));
}

async function liveType(typeId: string): Promise<boolean> {
  const rows = mustRows(await companyOs.from("training_types").select("id").eq("id", typeId).is("archived_at", null).limit(1), "[training] type");
  return rows.length === 1;
}

type MyRow = {
  id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  skip_reason: SkipReason | null;
  answered_at: string | null;
  // At most one: the key is unique per attendance row, but PostgREST embeds a
  // composite foreign key as a list.
  reviews: MyReview[] | null;
  training: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    self_logged: boolean;
    cancelled_at: string | null;
    created_at: string;
    type: { id: string; name: string; sort_order: number } | null;
    organiser: NamedPerson | null;
  } | null;
};

/** The member's review, only ever on an attended row (the database holds that too). */
function myReview(r: MyRow): MyReview | null {
  return r.status === "attended" ? (r.reviews?.[0] ?? null) : null;
}

/** The member's own trainings: not cancelled, not removed from. */
export async function myTrainingRows(personId: string): Promise<MyTrainingRow[]> {
  const [rows, types] = await Promise.all([
    companyOs
      .from("training_attendance")
      .select(`id, status, source, skip_reason, answered_at, reviews:training_reviews!training_reviews_attended_only(stars, load, tags, note, signed), training:trainings!inner(id, title, starts_at, ends_at, self_logged, cancelled_at, created_at, type:training_types(id, name, sort_order), organiser:people!trainings_organiser_id_fkey(${NAME_COLUMNS}))`)
      .eq("person_id", personId)
      .is("removed_at", null)
      .is("training.cancelled_at", null)
      .limit(500)
      .then((res) => mustRows(res, "[training] my trainings") as unknown as MyRow[]),
    listTypes({ withRetired: true }),
  ]);
  const rankOf = new Map(types.map((t) => [t.id, t.rank]));
  return rows.flatMap((r) => {
    const t = r.training;
    if (!t || !t.type) return [];
    return [
      {
        attendanceId: r.id,
        trainingId: t.id,
        title: t.title,
        typeId: t.type.id,
        typeName: t.type.name,
        typeRank: rankOf.get(t.type.id) ?? 0,
        organiserName: t.self_logged || !t.organiser ? null : personName(t.organiser),
        startsAt: t.starts_at,
        endsAt: t.ends_at,
        selfLogged: t.self_logged,
        status: r.status,
        source: r.source,
        skipReason: r.skip_reason,
        answeredAt: r.answered_at,
        review: myReview(r),
        loggedAt: t.created_at,
      },
    ];
  });
}

/**
 * A training whose second write failed is cancelled at once, so it shows
 * nowhere: no half-made training on anyone's record, and a retry cannot leave a
 * duplicate behind. Soft, like every other end of a training; the row stays.
 */
async function withdraw(trainingId: string, personId: string, now: Date): Promise<void> {
  const { error } = await companyOs.from("trainings").update({ cancelled_at: now.toISOString(), cancelled_by: personId }).eq("id", trainingId);
  if (error) console.error(`[training] could not withdraw half-made training ${trainingId}: ${error.message}`);
}

/** A training the member took on their own: they organised it and they went. */
export async function logOwnTraining(personId: string, input: LogInputType, now: Date): Promise<Result> {
  if (!(await liveType(input.typeId))) return { ok: false, error: "Pick a training type." };
  const { startsAt, endsAt } = saigonRange(input.date, input.start, input.minutes);
  if (new Date(startsAt).getTime() > now.getTime()) return { ok: false, error: "Log a training once it has started." };
  const { data, error } = await companyOs
    .from("trainings")
    .insert({ type_id: input.typeId, title: input.title, notes: input.notes ?? null, starts_at: startsAt, ends_at: endsAt, organiser_id: personId, self_logged: true })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not log that. Try again." };
  const attended: AttendanceStatus = "attended";
  const { error: aErr } = await companyOs
    .from("training_attendance")
    .insert({ training_id: data.id, person_id: personId, status: attended, answered_at: now.toISOString() });
  if (aErr) {
    await withdraw(data.id, personId, now);
    return { ok: false, error: "Could not log that. Try again." };
  }
  return { ok: true };
}

export type OrganisedTraining = {
  id: string;
  title: string;
  notes: string | null;
  typeId: string;
  typeName: string;
  typeRank: number;
  startsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  people: { id: string; name: string }[];
};

type OrganisedRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  type_id: string;
  attendance: { person_id: string; removed_at: string | null; person: NamedPerson | null }[];
};

/** What the organiser has scheduled, newest first, with who is on each. No answers. */
export async function organisedTrainings(organiserId: string): Promise<OrganisedTraining[]> {
  const [rows, types] = await Promise.all([
    companyOs
      .from("trainings")
      .select(`id, title, notes, starts_at, ends_at, cancelled_at, type_id, attendance:training_attendance(person_id, removed_at, person:people!training_attendance_person_id_fkey(${NAME_COLUMNS}))`)
      .eq("organiser_id", organiserId)
      .eq("self_logged", false)
      .order("starts_at", { ascending: false })
      .limit(200)
      .then((res) => mustRows(res, "[training] organised") as unknown as OrganisedRow[]),
    listTypes({ withRetired: true }),
  ]);
  const typeOf = new Map(types.map((t) => [t.id, t]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    typeId: r.type_id,
    typeName: typeOf.get(r.type_id)?.name ?? "Training",
    typeRank: typeOf.get(r.type_id)?.rank ?? 0,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    cancelledAt: r.cancelled_at,
    people: r.attendance
      .filter((a) => a.removed_at === null)
      .map((a) => ({ id: a.person_id, name: a.person ? personName(a.person) : "Someone" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/** Puts a training on each person's record; on a plan's when it is one of the plan's sessions (TR.5). */
export async function scheduleTraining(
  organiserId: string,
  input: ScheduleInputType,
  now: Date,
  planId: string | null = null,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await liveType(input.typeId))) return { ok: false, error: "Pick a training type." };
  const { startsAt, endsAt } = saigonRange(input.date, input.start, input.minutes);
  const { data, error } = await companyOs
    .from("trainings")
    .insert({ type_id: input.typeId, title: input.title, notes: input.notes ?? null, starts_at: startsAt, ends_at: endsAt, organiser_id: organiserId, self_logged: false, plan_id: planId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not schedule that. Try again." };
  const people = [...new Set(input.personIds)];
  const { error: aErr } = await companyOs.from("training_attendance").insert(people.map((p) => ({ training_id: data.id, person_id: p })));
  if (aErr) {
    await withdraw(data.id, organiserId, now);
    return { ok: false, error: "Could not schedule that. Try again." };
  }
  return { ok: true, id: data.id };
}

type OwnTraining = { id: string; starts_at: string; cancelled_at: string | null; attendance: { person_id: string; removed_at: string | null }[] };

async function ownTraining(organiserId: string, trainingId: string): Promise<OwnTraining | null> {
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id, starts_at, cancelled_at, attendance:training_attendance(person_id, removed_at)")
      .eq("id", trainingId)
      .eq("organiser_id", organiserId)
      .eq("self_logged", false)
      .limit(1),
    "[training] own training",
  ) as unknown as OwnTraining[];
  return rows[0] ?? null;
}

/** Takes people off (marked removed), puts removed people back and adds new ones. */
async function changeWho(organiserId: string, t: OwnTraining, personIds: readonly string[], now: Date): Promise<Result> {
  const want = new Set(personIds);
  const live = new Set(t.attendance.filter((a) => a.removed_at === null).map((a) => a.person_id));
  const removed = new Set(t.attendance.filter((a) => a.removed_at !== null).map((a) => a.person_id));
  const takeOff = [...live].filter((p) => !want.has(p));
  const putBack = [...want].filter((p) => removed.has(p));
  const add = [...want].filter((p) => !live.has(p) && !removed.has(p));
  const failed = { ok: false as const, error: "Could not change who is on it. Try again." };
  if (takeOff.length) {
    const { error } = await companyOs
      .from("training_attendance")
      .update({ removed_at: now.toISOString(), removed_by: organiserId })
      .eq("training_id", t.id)
      .in("person_id", takeOff);
    if (error) return failed;
  }
  if (putBack.length) {
    // A person put back starts with no word, the source included: a stale
    // organiser source would stop every later transcript from filling the row.
    const { error } = await companyOs
      .from("training_attendance")
      .update({ removed_at: null, removed_by: null, ...BLANK_WORD })
      .eq("training_id", t.id)
      .in("person_id", putBack);
    if (error) return failed;
  }
  if (add.length) {
    const { error } = await companyOs.from("training_attendance").insert(add.map((p) => ({ training_id: t.id, person_id: p })));
    if (error) return failed;
  }
  return { ok: true };
}

/**
 * Changes a training the organiser scheduled. Before it starts anything may
 * change; after, only the title and notes, and a change to the rest is refused
 * rather than dropped, so the organiser knows.
 */
export async function updateTraining(organiserId: string, trainingId: string, input: UpdateInputType, now: Date): Promise<Result> {
  const t = await ownTraining(organiserId, trainingId);
  if (!t) return { ok: false, error: "That training was not found." };
  const may = organiserMay({ startsAt: t.starts_at, cancelledAt: t.cancelled_at }, now);
  const moving = input.date !== undefined || input.start !== undefined || input.minutes !== undefined;
  if (!may.editText) return { ok: false, error: "A cancelled training cannot change." };
  if (moving && !may.move) return { ok: false, error: "It has started, so only the title and notes can change." };
  if (input.personIds && !may.changeWho) return { ok: false, error: "It has started, so who is on it cannot change." };
  if (moving && (input.date === undefined || input.start === undefined || input.minutes === undefined)) {
    return { ok: false, error: "Give the date, start and length together." };
  }
  // Who is on it changes first, then the training itself: if the second step
  // fails, the people are right and the old title and time still stand, rather
  // than a renamed training with the wrong people on it.
  if (input.personIds) {
    const changed = await changeWho(organiserId, t, input.personIds, now);
    if (!changed.ok) return changed;
  }
  const range = moving ? saigonRange(input.date!, input.start!, input.minutes!) : null;
  const patch = { title: input.title, notes: input.notes ?? null, ...(range ? { starts_at: range.startsAt, ends_at: range.endsAt } : {}) };
  const { error } = await companyOs.from("trainings").update(patch).eq("id", trainingId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: input.personIds ? "Who is on it was saved, but the rest was not. Try again." : "Could not save that. Try again." };
  return { ok: true };
}

/** Cancels a training before it starts. */
export async function cancelTraining(organiserId: string, trainingId: string, now: Date): Promise<Result> {
  const t = await ownTraining(organiserId, trainingId);
  if (!t) return { ok: false, error: "That training was not found." };
  if (!organiserMay({ startsAt: t.starts_at, cancelledAt: t.cancelled_at }, now).cancel) {
    return { ok: false, error: "Only a training that has not started can be cancelled." };
  }
  const { error } = await companyOs
    .from("trainings")
    .update({ cancelled_at: now.toISOString(), cancelled_by: organiserId })
    .eq("id", trainingId)
    .eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not cancel it. Try again." };
  return { ok: true };
}

/** Whether a live type other than `exceptId` already has this name, case-insensitive. */
async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  return (await listTypes()).some((t) => t.id !== exceptId && t.name.toLowerCase() === name.toLowerCase());
}

const NAME_TAKEN = { ok: false as const, error: "A type with that name already exists." };

/** Adds a type at the end of the list. A live type with the same name is refused. */
export async function addType(personId: string | null, name: string): Promise<Result> {
  if (await nameTaken(name)) return NAME_TAKEN;
  const last = mustRows(await companyOs.from("training_types").select("sort_order").order("sort_order", { ascending: false }).limit(1), "[training] last type") as { sort_order: number }[];
  const { error } = await companyOs.from("training_types").insert({ name, sort_order: (last[0]?.sort_order ?? 0) + 10, created_by: personId });
  if (error) return { ok: false, error: "Could not add that type. Try again." };
  return { ok: true };
}

export async function renameType(typeId: string, name: string): Promise<Result> {
  if (await nameTaken(name, typeId)) return NAME_TAKEN;
  const { error } = await companyOs.from("training_types").update({ name }).eq("id", typeId).is("archived_at", null);
  if (error) return { ok: false, error: "Could not rename it. Try again." };
  return { ok: true };
}

/** Retires a type: its trainings keep it, new ones cannot choose it. */
export async function retireType(personId: string | null, typeId: string, now: Date): Promise<Result> {
  const { error } = await companyOs.from("training_types").update({ archived_at: now.toISOString(), archived_by: personId }).eq("id", typeId).is("archived_at", null);
  if (error) return { ok: false, error: "Could not retire it. Try again." };
  return { ok: true };
}
