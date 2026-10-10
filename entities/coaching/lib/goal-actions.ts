"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
// Concrete data files, never the entity index: this entity's client components
// import these actions, so going through the index would close an
// index -> ui -> actions -> index cycle (the same rule as ./actions.ts).
import { coachAddGoal, coachDeleteGoal, coachUpdateGoal } from "./data/coach-edits";
import { addGoalComment } from "./data/goals";
import { ladderLabelFor, type MyGoalInput } from "./data/my-goals";
import { goalNoticeTarget, goalOwnerContact, notifyGoalChange, summarize } from "./goal-notify";
import type { GoalStatus } from "./types";
import type { Result } from "@/kernel/data/result";

import { parseInput, zDay, zId, zLooseText, zMarkdown, zText } from "./schemas";
import { QUARTER_PATTERN } from "./quarter-review";
import { z } from "zod";
import { refreshCoachAndDirectory, refreshCoaching } from "./revalidate";

// What a goal action accepts (ticket 13). MyGoalInput is the richest shape in
// the entity — twelve fields, three of them numbers and one a nested ladder —
// and it arrived from the client entirely unchecked.
const zLadder = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.enum(["objective", "key_result"]), id: zId }),
]);

const zGoalInput = z.object({
  title: zText(500, "Give the goal a title."),
  ladder: zLadder,
  descriptionMarkdown: zMarkdown.nullable(),
  status: z.enum(["draft", "active", "achieved", "dropped"]),
  // QUARTER_PATTERN, not a literal. This field shipped in #1447 as a re-typed
  // /^\d{4}Q[1-4]$/ with no hyphen, and quarterLabelFor writes 2026-Q3 with
  // one, so the schema refused every label its own form produces: add and
  // update failed here for every coach and manager until this line. The
  // pattern has one definition and this is it.
  quarterLabel: z.string().regex(QUARTER_PATTERN, "Give the quarter as 2026-Q3.").nullable(),
  metricUnit: zLooseText(100).nullable(),
  // Finite, because Infinity and NaN both survive a JSON round trip and would
  // be stored as-is; the bar and every delta downstream divide by these.
  startValue: z.number().finite("Give a real number.").nullable(),
  targetValue: z.number().finite("Give a real number.").nullable(),
  currentValue: z.number().finite("Give a real number.").nullable(),
  dueDate: zDay.nullable(),
  stretchMarkdown: zMarkdown.nullable().optional(),
});

const S = {
  comment: z.object({ goalId: zId, body: zText(5_000, "Write the comment first.") }),
  add: z.object({ profileId: zId, input: zGoalInput }),
  update: z.object({ profileId: zId, goalId: zId, input: zGoalInput }),
  del: z.object({ profileId: zId, goalId: zId }),
};

// The coach-tier and directory-tier FAST goal writes, split out of ./actions.ts
// when K.13 gave each one a notification and that file crossed its size cap.
// The member's own writes live beside their page
// (routes/team/(dashboard)/goals/actions.ts); the gate here is canManageGoals
// inside each coach* helper: the profile's coach, or any manager.


// Comments on FAST goals: open to every team member (goals are transparent,
// so is the discussion). Revalidates all three surfaces that render them.
export async function commentOnGoal(goalId: string, body: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.comment, { goalId, body });
  if (!p.ok) return p;
  const res = await addGoalComment(actor, p.data.goalId, p.data.body);
  if (res.ok) {
    refreshCoaching({ coachList: true, member: true, directory: true });
  }
  return res;
}

// The coach's and the directory's goal writes. Both notify the goal's OWNER
// (the member), which is the other half of the promise /team/goals makes to
// the member — their own edits notify their manager (K.13, item 5).
export async function addGoal(profileId: string, input: MyGoalInput): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.add, { profileId, input });
  if (!p.ok) return p;
  const res = await coachAddGoal(actor, p.data.profileId, p.data.input);
  if (!res.ok) return res;
  notifyGoalChange(actor, "added", summarize(input, await ladderLabelFor(input.ladder)), await goalOwnerContact(profileId));
  refreshCoachAndDirectory(profileId);
  return res;
}

export async function updateGoal(
  profileId: string,
  goalId: string,
  input: MyGoalInput,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.update, { profileId, goalId, input });
  if (!p.ok) return p;
  // The owner is read before the write only to name the recipient; the write's
  // own gate is canManageGoals inside coachUpdateGoal.
  const { recipient } = await goalNoticeTarget(p.data.goalId);
  const res = await coachUpdateGoal(actor, goalId, input);
  if (!res.ok) return res;
  notifyGoalChange(actor, "updated", summarize(input, await ladderLabelFor(input.ladder)), recipient);
  refreshCoachAndDirectory(profileId);
  return res;
}

export async function deleteGoal(profileId: string, goalId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.del, { profileId, goalId });
  if (!p.ok) return p;
  // Read the row before it goes, so the notice can name what was deleted.
  const { recipient, title, status } = await goalNoticeTarget(p.data.goalId);
  const res = await coachDeleteGoal(actor, goalId);
  if (!res.ok) return res;
  if (title) {
    notifyGoalChange(
      actor,
      "deleted",
      summarize(
        {
          title,
          status: (status ?? "dropped") as GoalStatus,
          quarterLabel: null,
          metricUnit: null,
          targetValue: null,
          currentValue: null,
          dueDate: null,
        },
        null,
      ),
      recipient,
    );
  }
  refreshCoachAndDirectory(profileId);
  return res;
}
