// A session's plan (English Program PR 3): the ordered blocks a class runs,
// each a library exercise or a free line with its minutes and its side. Claude
// drafts it the morning before (./prep-draft); the organiser edits it on the
// session page and marks it checked. A block may name only a live library
// exercise: the validator refuses an unknown or retired one, so a draft that
// invents an exercise never saves. The pure parts (the block schema, the
// minutes split) are in ./session-plan-rules so the editor can share them.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { listExercises } from "./exercises";
import type { Exercise } from "./exercise-rules";
import { organiserMay, trainingState, type AttendanceSource, type AttendanceStatus, type TrainingState } from "./training-rules";
import { PLAN_STATES, type BlockInputType, type PlanState, type SessionBlock } from "./session-plan-rules";
import { RECAP_STATES, Recap, type RecapState, type RecapType } from "./session-recap-rules";

export type SessionView = {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  state: TrainingState;
  mayEdit: boolean;
  planId: string | null;
  planTitle: string | null;
  planState: PlanState;
  planReasoning: string | null;
  materials: { label: string; url: string }[];
  recap: RecapType | null;
  recapState: RecapState;
  people: { id: string; name: string; status: AttendanceStatus; source: AttendanceSource }[];
  blocks: SessionBlock[];
  // The library this session may draw on: shared and the plan's own, live only.
  library: Exercise[];
};

type SessionRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  plan_id: string | null;
  plan_state: string;
  plan_reasoning: string | null;
  materials: unknown;
  recap: unknown;
  recap_state: string;
  plan: { title: string } | null;
  attendance: { person_id: string; removed_at: string | null; status: AttendanceStatus; source: AttendanceSource; person: NamedPerson | null }[];
  blocks: { id: string; position: number; side: "presentation" | "reactive"; exercise_id: string | null; text: string | null; minutes: number }[];
};

const SESSION_COLUMNS = `id, title, notes, starts_at, ends_at, cancelled_at, plan_id, plan_state, plan_reasoning, materials, recap, recap_state, plan:training_plans(title), attendance:training_attendance(person_id, removed_at, status, source, person:people!training_attendance_person_id_fkey(${NAME_COLUMNS})), blocks:training_session_blocks(id, position, side, exercise_id, text, minutes)`;

/** The recap as stored, or null when none or not the shape the code knows. */
function readRecap(raw: unknown): RecapType | null {
  const p = Recap.safeParse(raw);
  return p.success ? p.data : null;
}

function materialsOf(raw: unknown): { label: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((m) => (m && typeof m === "object" && typeof (m as { url?: unknown }).url === "string" ? [{ label: String((m as { label?: unknown }).label ?? "Link"), url: (m as { url: string }).url }] : []));
}

/** One session the organiser runs, with its blocks and the library it may draw on; null when it is not theirs. */
export async function readSessionPlan(organiserId: string, trainingId: string, now: Date): Promise<SessionView | null> {
  const rows = mustRows(
    await companyOs.from("trainings").select(SESSION_COLUMNS).eq("id", trainingId).eq("organiser_id", organiserId).eq("self_logged", false).limit(1),
    "[training] session",
  ) as unknown as SessionRow[];
  const s = rows[0];
  if (!s) return null;
  const library = (await listExercises()).filter((e) => e.planId === null || e.planId === s.plan_id);
  const byId = new Map(library.map((e) => [e.id, e]));
  const state = trainingState({ startsAt: s.starts_at, cancelledAt: s.cancelled_at }, now);
  return {
    id: s.id,
    title: s.title,
    notes: s.notes,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    state,
    mayEdit: organiserMay({ startsAt: s.starts_at, cancelledAt: s.cancelled_at }, now).editText,
    planId: s.plan_id,
    planTitle: s.plan?.title ?? null,
    planState: (PLAN_STATES as readonly string[]).includes(s.plan_state) ? (s.plan_state as PlanState) : "none",
    planReasoning: s.plan_reasoning,
    materials: materialsOf(s.materials),
    recap: readRecap(s.recap),
    recapState: (RECAP_STATES as readonly string[]).includes(s.recap_state) ? (s.recap_state as RecapState) : "none",
    people: s.attendance
      .filter((a) => a.removed_at === null)
      .map((a) => ({ id: a.person_id, name: a.person ? personName(a.person) : "Someone", status: a.status, source: a.source }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    blocks: [...s.blocks]
      .sort((a, b) => a.position - b.position)
      .map((b) => ({ side: b.side, exerciseId: b.exercise_id, text: b.text, minutes: b.minutes, exerciseTitle: b.exercise_id ? (byId.get(b.exercise_id)?.title ?? "A retired exercise") : null })),
    library,
  };
}

/** Which of the blocks' exercise ids are not live in the library this session may use. */
export function unknownExercises(blocks: readonly BlockInputType[], library: readonly Pick<Exercise, "id">[]): string[] {
  const known = new Set(library.map((e) => e.id));
  return blocks.flatMap((b) => (b.exerciseId && !known.has(b.exerciseId) ? [b.exerciseId] : []));
}

/**
 * Replaces the session's blocks as a set and records who wrote them: the prep
 * routine leaves the plan drafted, the organiser leaves it checked. Refuses a
 * block naming an exercise not live in the session's library.
 */
export async function saveBlocks(organiserId: string, trainingId: string, blocks: BlockInputType[], by: "draft" | "organiser", reasoning: string | null, now: Date): Promise<Result> {
  const session = await readSessionPlan(organiserId, trainingId, now);
  if (!session) return { ok: false, error: "That session was not found." };
  if (!session.mayEdit) return { ok: false, error: "A cancelled session has no plan." };
  const unknown = unknownExercises(blocks, session.library);
  if (unknown.length) return { ok: false, error: "A block names an exercise that is not in the library." };
  const { error: delErr } = await companyOs.from("training_session_blocks").delete().eq("training_id", trainingId);
  if (delErr) return { ok: false, error: "Could not save the plan. Try again." };
  if (blocks.length) {
    const { error } = await companyOs
      .from("training_session_blocks")
      .insert(blocks.map((b, i) => ({ training_id: trainingId, position: i, side: b.side, exercise_id: b.exerciseId, text: b.exerciseId ? null : b.text, minutes: b.minutes })));
    if (error) return { ok: false, error: "Could not save the plan. Try again." };
  }
  const planState: PlanState = by === "draft" ? "drafted" : "checked";
  const { error } = await companyOs
    .from("trainings")
    .update({ plan_state: planState, ...(reasoning !== null ? { plan_reasoning: reasoning } : {}) })
    .eq("id", trainingId)
    .eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "The blocks were saved, but the plan's state was not. Try again." };
  return { ok: true };
}

/** The organiser has read the draft: checked. */
export async function markChecked(organiserId: string, trainingId: string): Promise<Result> {
  const checked: PlanState = "checked";
  const { error } = await companyOs.from("trainings").update({ plan_state: checked }).eq("id", trainingId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not mark it checked. Try again." };
  return { ok: true };
}

/** The links the organiser attached, shown to the learners. */
export async function saveMaterials(organiserId: string, trainingId: string, materials: { label: string; url: string }[]): Promise<Result> {
  const { error } = await companyOs.from("trainings").update({ materials }).eq("id", trainingId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not save the materials. Try again." };
  return { ok: true };
}
