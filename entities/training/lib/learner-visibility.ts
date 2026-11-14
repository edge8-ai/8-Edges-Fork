// Whether a plan's learners may see it (training_plans.open_to_learners). An
// organiser builds a plan, drafts its sessions and writes its philosophy before
// the class starts; while the plan is closed its learners see none of it: no
// session on My Training, no homework, no note, no recap, no badge, no Inbox
// line, and a member action on one of its sessions is refused as if the
// session did not exist, so a guessed URL tells them nothing. The organiser's
// pages, the organiser's Inbox and every routine carry on unchanged. A session
// with no plan (a self-logged training, a Raid's taught session) is never
// closed.
//
// The rule lives here once. A learner read embeds the plan's flag through
// PLAN_FLAG and drops what hiddenFromLearners says is hidden; a member action
// and an organiser action that tells learners something ask the two reads
// below. Reads raise on failure (rule 2): a failed read must not open a closed
// plan, nor close an open one silently.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

/** The embed a learner read adds to a training's select, beside its plan_id. */
export const PLAN_FLAG = "plan_flag:training_plans(open_to_learners)";

/** A training as a learner read sees it: its plan, and the plan's flag when it has one. */
export type FlaggedTraining = { plan_id: string | null; plan_flag?: { open_to_learners: boolean } | null };

/** Pure: a session on a plan closed to learners. A session with no plan is never hidden. */
export function hiddenFromLearners(t: FlaggedTraining): boolean {
  return t.plan_id !== null && t.plan_flag?.open_to_learners === false;
}

/** Pure: a plan's own flag, for a read that starts at the plan. */
export function planHidden(plan: { open_to_learners?: boolean } | null | undefined): boolean {
  return plan?.open_to_learners === false;
}

/** Whether a plan is open to its learners. A plan that does not exist is not. */
export async function planOpenToLearners(planId: string): Promise<boolean> {
  const rows = mustRows(await companyOs.from("training_plans").select("open_to_learners").eq("id", planId).limit(1), "[training] plan open to learners") as { open_to_learners: boolean }[];
  return rows[0]?.open_to_learners === true;
}

/** Whether a session's learners may see it: no plan, or an open one. A session that does not exist is not. */
export async function sessionOpenToLearners(trainingId: string): Promise<boolean> {
  const rows = mustRows(await companyOs.from("trainings").select(`plan_id, ${PLAN_FLAG}`).eq("id", trainingId).limit(1), "[training] session open to learners") as unknown as FlaggedTraining[];
  const t = rows[0];
  return t !== undefined && !hiddenFromLearners(t);
}
