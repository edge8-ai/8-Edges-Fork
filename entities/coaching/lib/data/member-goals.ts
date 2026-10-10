import { companyOs } from "@/kernel/data/supabase";
import type { GoalStatus, GoalComment } from "../types";
import { ladderValue } from "../ladder";
import { GOAL_SELECT, getEdgesLadderOptions, getGoalComments, toGoal } from "./goals";
import { getCoachingProfileIdForMember } from "./shared";

// The directory's read of a member's active goals (Transparent, the T in
// FAST): any team member may see them. Moved out of member.ts on 2026-09-16
// when that file crossed the 400-line cap; nothing here is member-tier
// authorisation, it is a public read keyed by team member id.

// A goal as a directory profile shows AND edits it. The directory used to hold
// a title only, which is why a goal created there laddered to nothing and its
// owner could not save it (K.13, spec §10); it now carries everything the one
// shared FastGoalForm needs.
export type TeamMemberGoal = {
  goalId: string;
  title: string;
  status: GoalStatus;
  quarterLabel: string | null;
  ladderLabel: string | null;
  // The ladder as the picker encodes it ("kind:id"), "" for none.
  ladderValue: string;
  descriptionMarkdown: string | null;
  stretchMarkdown: string | null;
  metricUnit: string | null;
  startValue: number | null;
  currentValue: number | null;
  targetValue: number | null;
  dueDate: string | null;
  comments: GoalComment[];
};

export async function getTeamMemberActiveGoals(teamMemberId: string): Promise<TeamMemberGoal[]> {
  const profileId = await getCoachingProfileIdForMember(teamMemberId);
  if (!profileId) return [];
  const [{ data }, edges] = await Promise.all([
    companyOs
      .from("goals")
      .select(GOAL_SELECT)
      .eq("coaching_profile_id", profileId)
      .eq("status", "active")
      .order("created_at"),
    getEdgesLadderOptions(),
  ]);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => toGoal(r, edges));
  const comments = await getGoalComments(rows.map((g) => g.id));
  return rows.map((g) => ({
    goalId: g.id,
    title: g.title,
    status: g.status,
    quarterLabel: g.quarterLabel,
    ladderLabel: g.ladder?.label ?? null,
    ladderValue: ladderValue(g.ladder),
    descriptionMarkdown: g.descriptionMarkdown,
    stretchMarkdown: g.stretchMarkdown,
    metricUnit: g.metricUnit,
    startValue: g.startValue,
    currentValue: g.currentValue,
    targetValue: g.targetValue,
    dueDate: g.dueDate,
    comments: comments.get(g.id) ?? [],
  }));
}

// Member status update on a commitment on their OWN profile — status + note
// only, never title/due date/owner. Also stamps the latest unanswered check-in
// as responded, closing the mid-cycle loop.
