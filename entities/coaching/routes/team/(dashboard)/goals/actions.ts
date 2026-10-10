"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  getMyGoals,
  ladderLabelFor,
  myAddGoal,
  myDeleteGoal,
  myUpdateGoal,
  type MyGoalInput,
} from "@/entities/coaching";
import { notifyGoalChange, summarize } from "@/entities/coaching/lib/goal-notify";
import { parseInput, zDay, zId, zLooseText, zMarkdown, zText } from "@/entities/coaching/lib/schemas";
import { QUARTER_PATTERN } from "@/entities/coaching/lib/quarter-review";
import { z } from "zod";
import type { Result } from "@/kernel/data/result";
import { refreshMember } from "@/entities/coaching/lib/revalidate";

// Own-service FAST goal writes for /team/goals. Every mutation re-derives
// ownership inside lib/coaching/data.ts (my* = team_member_id is the actor's
// own), so a forged goal id buys nothing. Manager email + Lark fire only after
// the write succeeds, and never block it.

// What the MEMBER's goal actions accept (ticket 13). These three live under
// routes/ rather than lib/, which is how the entity-wide parse pass counted
// sixty-seven actions in an entity that has seventy.
//
// The shape is the coach tier's zGoalInput (goal-actions.ts) field for field,
// because both tiers are fed by the same FastGoalForm. It is copied rather
// than imported because goal-actions.ts is a "use server" file, and such a
// file may export nothing but async functions, so its schema cannot be
// reached from here.
//
// Both tiers now spell quarterLabel as the canonical QUARTER_PATTERN. The
// coach tier's copy had been re-typed as /^\d{4}Q[1-4]$/ with no hyphen, which
// refused every label quarterLabelFor produces, so its add and update failed
// for every coach and manager from #1447 until this branch. That is the cost of
// a shape described twice, and the reason this file describes it a third time
// only until the shared-schema question is settled.
//
// The domain rules stay in validateGoal (data/my-goals.ts): that a goal must
// ladder up to a company goal, and the 200-character title it enforces, are
// decisions about what a goal IS. This says only that the payload arrived
// intact, which is the half nothing was checking.
const zLadder = z.union([
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.enum(["objective", "key_result"]), id: zId }),
]);

const zGoalInput = z.object({
  title: zText(500, "Give the goal a title."),
  ladder: zLadder,
  descriptionMarkdown: zMarkdown.nullable(),
  status: z.enum(["draft", "active", "achieved", "dropped"]),
  // QUARTER_PATTERN, not a literal: the label is derived from the due date by
  // quarterLabelFor, which writes 2026-Q3 with the hyphen, and the goals table
  // stores that form. A re-typed regex is how a schema comes to refuse the only
  // value its own form can produce (see the note on the coach tier above).
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
  add: zGoalInput,
  update: z.object({ goalId: zId, input: zGoalInput }),
  del: z.object({ goalId: zId }),
};


export async function addMyGoal(input: MyGoalInput): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.add, input);
  if (!p.ok) return p;
  const res = await myAddGoal(actor, p.data);
  if (!res.ok) return res;

  notifyGoalChange(actor, "added", summarize(p.data, await ladderLabelFor(p.data.ladder)));
  refreshMember();
  return { ok: true };
}

export async function updateMyGoal(goalId: string, input: MyGoalInput): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.update, { goalId, input });
  if (!p.ok) return p;
  const edited = p.data.input;
  const res = await myUpdateGoal(actor, p.data.goalId, edited);
  if (!res.ok) return res;

  notifyGoalChange(actor, "updated", summarize(edited, await ladderLabelFor(edited.ladder)));
  refreshMember();
  return { ok: true };
}

export async function deleteMyGoal(goalId: string): Promise<Result> {
  await requirePermission("coaching.mine");
  const actor = await requireTeamMember();
  const p = parseInput(S.del, { goalId });
  if (!p.ok) return p;

  // Read the row before it goes, so the notice can name what was deleted.
  // Scoped read: getMyGoals only ever returns the actor's own goals, so a
  // forged id simply finds nothing here and is rejected by myDeleteGoal.
  const goal = (await getMyGoals(actor)).find((g) => g.id === p.data.goalId);

  const res = await myDeleteGoal(actor, p.data.goalId);
  if (!res.ok) return res;

  if (goal) notifyGoalChange(actor, "deleted", summarize(goal, goal.ladder?.label ?? null));
  refreshMember();
  return { ok: true };
}
