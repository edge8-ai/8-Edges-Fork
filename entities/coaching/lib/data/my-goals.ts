import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { normaliseLetter } from "../quarter-letter";
import { saigonToday } from "@/kernel/config/dates";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { recordAudit } from "@/kernel/audit/audit";
import { GOAL_AUDIT_TABLE } from "./goal-bumps";
import { GOAL_STATUS_LABELS, type GoalStatus, type CoachingGoal, type LadderInput } from "../types";
import { GOAL_SELECT, getEdgesLadderOptions, toGoal } from "./goals";
import { getCoachingProfileIdForMember, ladderColumns, type Result } from "./shared";

export type MyGoalInput = {
  title: string;
  // Which company key result this goal ladders to (a few legacy goals still
  // ladder to an objective directly).
  // { kind: "none" } is a deliberate "stands on its own", not a missing value.
  ladder: LadderInput;
  descriptionMarkdown: string | null;
  status: GoalStatus;
  quarterLabel: string | null;
  metricUnit: string | null;
  startValue: number | null;
  targetValue: number | null;
  currentValue: number | null;
  dueDate: string | null;
  // "What would doubling it look like" — optional so the three older callers
  // (and the admin editor in entities/org) compile unchanged; the shared form
  // always sends it.
  stretchMarkdown?: string | null;
};

// The actor's own active coaching profile, created on first save if they have
// none. Your goals are yours: a member with no manager on file still gets a
// profile, with coach_id left null (it is nullable for exactly this reason —
// scripts/coaching/coach-optional.mjs). The daily coaching cycle skips
// coachless profiles; the goals themselves work regardless.
export async function getOrCreateMyCoachingProfileId(
  actor: TeamActor,
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await companyOs
    .from("coaching_profiles")
    .select("id")
    .eq("team_member_id", actor.teamMemberId)
    // Not filtered on `active`: team_member_id is unique, so a profile taken
    // off the roster (active=false) still owns this person's goals. Filtering
    // it out made the insert below hit the unique constraint for anyone ever
    // removed from a coach's roster (K.3, B4).
    .maybeSingle();
  if (existingError) console.error("[team/coaching/my-goals] coaching_profiles", existingError);
  if (existing) return { ok: true, profileId: (existing as { id: string }).id };

  const { data: me, error: meError } = await companyOs
    .from("team_members")
    .select("manager_id")
    .eq("id", actor.teamMemberId)
    .maybeSingle();
  if (meError) console.error("[team/coaching/my-goals] team_members", meError);
  const managerId = (me as { manager_id: string | null } | null)?.manager_id ?? null;

  const { data: created, error } = await companyOs
    .from("coaching_profiles")
    .insert({ team_member_id: actor.teamMemberId, coach_id: managerId })
    .select("id")
    .maybeSingle();
  if (error || !created) return { ok: false, error: "Could not start your goals. Try again." };
  return { ok: true, profileId: (created as { id: string }).id };
}

// Every goal on the actor's own profile, including ones their coach set for
// them: a FAST goal is jointly owned, and each change notifies the manager.
// Throws on a read error rather than rendering "no goals": the page offers to
// add a goal, and a member who adds one they already have has been lied to
// (K.13, spec §10, "silent failures").
export async function getMyGoals(actor: TeamActor): Promise<CoachingGoal[]> {
  const profileId = await getCoachingProfileIdForMember(actor.teamMemberId);
  if (!profileId) return [];

  const [goals, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .order("created_at"),
    getEdgesLadderOptions(),
  ]);
  if (goals.error) {
    console.error("[team/coaching/my-goals] goals", goals.error);
    throw new Error("Could not load your goals.");
  }
  return ((goals.data ?? []) as unknown as Record<string, unknown>[]).map((g) => toGoal(g, edges));
}

// The goal as the authorization gate needs it: whose profile it hangs off, and
// who wrote it. The IDOR gate for every my* goal mutation — a client-supplied
// goal id is never the authority.
async function goalOwnership(
  actor: TeamActor,
  goalId: string,
): Promise<{ mine: boolean; authored: boolean }> {
  const no = { mine: false, authored: false };
  if (!goalId) return no;
  const { data, error: dataError } = await companyOs
    .from("goals")
    .select("id, created_by, coaching_profiles:coaching_profiles!coaching_profile_id(team_member_id)")
    .eq("id", goalId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/my-goals] goals", dataError);
  if (!data) return no;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(
    r.coaching_profiles as { team_member_id: string } | { team_member_id: string }[] | null,
  );
  return {
    mine: prof?.team_member_id === actor.teamMemberId,
    authored: (r.created_by as string | null) === actor.teamMemberId,
  };
}

// `Update` rather than `Insert` because the caller supplies coaching_profile_id;
// `title` is intersected back in because this always sets it and the insert
// needs it.
export function goalColumns(input: MyGoalInput): CompanyOsUpdate<"goals"> & { title: string } {
  return {
    title: input.title.trim(),
    description_markdown: input.descriptionMarkdown?.trim() || null,
    status: input.status,
    quarter_label: input.quarterLabel?.trim() || null,
    metric_unit: input.metricUnit?.trim() || null,
    start_value: input.startValue,
    target_value: input.targetValue,
    current_value: input.currentValue,
    due_date: input.dueDate || null,
    stretch_markdown: input.stretchMarkdown?.trim() || null,
    ...ladderColumns(input.ladder),
  };
}

export function validateGoal(input: MyGoalInput): string | null {
  if (!input.title.trim()) return "Write the goal first.";
  // Every FAST goal ladders to a company goal; "stands on its own" is no
  // longer accepted from the goal forms (coach-tier quick edits are separate).
  if (input.ladder.kind === "none") return "Pick the company goal this ladders up to.";
  if (input.title.trim().length > 200) return "Keep the goal title under 200 characters.";
  if (!(input.status in GOAL_STATUS_LABELS)) return "Bad status.";
  for (const v of [input.startValue, input.targetValue, input.currentValue]) {
    if (v !== null && !Number.isFinite(v)) return "The measure values need to be numbers.";
  }
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return "Pick a valid due date.";
  return null;
}

// The human label behind a LadderInput, for the notices that name what a goal
// ladders to. Resolved server-side from the live Edges options, never trusted
// from the client.
export async function ladderLabelFor(ladder: LadderInput): Promise<string | null> {
  if (ladder.kind === "none") return null;
  const edges = await getEdgesLadderOptions();
  const pool = ladder.kind === "objective" ? edges.objectives : edges.keyResults;
  return (pool as { id: string; label: string }[]).find((x) => x.id === ladder.id)?.label ?? null;
}

export async function myAddGoal(actor: TeamActor, input: MyGoalInput): Promise<Result> {
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const profile = await getOrCreateMyCoachingProfileId(actor);
  if (!profile.ok) return { ok: false, error: profile.error };

  const { error } = await companyOs
    .from("goals")
    .insert({
      coaching_profile_id: profile.profileId,
      created_by: actor.teamMemberId,
      ...goalColumns(input),
    });
  return error ? { ok: false, error: "Could not add the goal." } : { ok: true };
}

// Editing stays open across the member's own profile: updating progress on a
// goal your coach set for you is the point of the F in FAST. Deleting is not
// (see myDeleteGoal).
export async function myUpdateGoal(
  actor: TeamActor,
  goalId: string,
  input: MyGoalInput,
): Promise<Result> {
  if (!(await goalOwnership(actor, goalId)).mine) return { ok: false, error: "Not found." };
  const invalid = validateGoal(input);
  if (invalid) return { ok: false, error: invalid };

  const { error } = await companyOs
    .from("goals")
    .update({ ...goalColumns(input), updated_at: new Date().toISOString() })
    .eq("id", goalId);
  return error ? { ok: false, error: "Could not save the goal." } : { ok: true };
}

// True delete, matching coachDeleteGoal: comments cascade, no tombstone.
// Only the author may delete: a goal your coach or manager set for you is
// theirs to remove, and you can still edit it or mark it dropped.
export async function myDeleteGoal(actor: TeamActor, goalId: string): Promise<Result> {
  const own = await goalOwnership(actor, goalId);
  if (!own.mine) return { ok: false, error: "Not found." };
  if (!own.authored) {
    return {
      ok: false,
      error: "This goal was set for you, so only whoever set it can delete it. You can edit it or mark it dropped.",
    };
  }
  const { error } = await companyOs.from("goals").delete().eq("id", goalId);
  return error ? { ok: false, error: "Could not delete the goal." } : { ok: true };
}

// The number alone (K.41): the member bumps "where I am now" where the goal
// lives on the Overview, without opening the whole form. Own goal only; the
// rest of the goal is untouched.
export async function myUpdateGoalProgress(actor: TeamActor, goalId: string, currentValue: number): Promise<Result> {
  if (!(await goalOwnership(actor, goalId)).mine) return { ok: false, error: "Not found." };
  if (!Number.isFinite(currentValue) || currentValue < 0) return { ok: false, error: "Give the number as it is now." };
  // The value before the bump, so the audit row carries the move and not just
  // the landing point. A read error leaves it null: the trail is worth having
  // even when the previous number could not be fetched.
  const { data: before, error: beforeError } = await companyOs
    .from("goals")
    .select("current_value")
    .eq("id", goalId)
    .maybeSingle();
  if (beforeError) console.error("[team/coaching/my-goals] goals", beforeError);
  const { error } = await companyOs
    .from("goals")
    .update({ current_value: currentValue, updated_at: new Date().toISOString() })
    .eq("id", goalId);
  if (error) return { ok: false, error: "Could not save the number." };
  // The bump is the only thing the caption counts (K.42), so it is recorded
  // here rather than in the action: every path that bumps the number this way
  // goes through this function. recordAudit is best-effort by design.
  await recordAudit({
    table: GOAL_AUDIT_TABLE,
    recordId: goalId,
    operation: "update",
    actor: actor.email,
    oldData: { current_value: (before as { current_value: number | null } | null)?.current_value ?? null },
    newData: { current_value: currentValue },
  });
  return { ok: true };
}

/**
 * The letter to your end-of-quarter self (L.10).
 *
 * Written once, when the goal is set, and not shown back until that quarter's
 * review. Rewriting it is allowed while the quarter is still running — a member
 * who thinks of a better sentence in week two should not be stuck with week
 * one's — and `letter_sealed_on` moves with it, because what the page says
 * later is how long ago they wrote the words they are reading.
 */
export async function myWriteGoalLetter(actor: TeamActor, goalId: string, letter: string): Promise<Result> {
  if (!(await goalOwnership(actor, goalId)).mine) return { ok: false, error: "Not found." };
  const text = normaliseLetter(letter);
  const { error } = await companyOs
    .from("goals")
    .update({
      letter_md: text,
      letter_sealed_on: text ? saigonToday() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId);
  if (error) return { ok: false, error: "Could not save the letter." };
  return { ok: true };
}
