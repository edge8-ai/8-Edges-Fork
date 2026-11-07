// The member's weekly training goal (TR.12): minutes a week they aim for, set
// with one tap on My Training and seen by nobody else (ADR 0016). One row per
// person; "No goal" is a null, so clearing it is an update, never a delete.
// The read raises on failure (rule 2): a failed read must not look like a
// member who never set a goal.
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { GOAL_MAX, GOAL_MIN } from "./training-block";

export const GoalInput = z.object({
  minutes: z.number().int().min(GOAL_MIN, `A goal is at least ${GOAL_MIN} minutes.`).max(GOAL_MAX, `A goal is at most ${GOAL_MAX} minutes.`).nullable(),
});
export type GoalInputType = z.infer<typeof GoalInput>;

/** The member's goal in minutes a week, or null when they have none. */
export async function myWeeklyGoal(personId: string): Promise<number | null> {
  const rows = mustRows(
    await companyOs.from("training_weekly_goals").select("weekly_minutes").eq("person_id", personId).limit(1),
    "[training] weekly goal",
  ) as { weekly_minutes: number | null }[];
  return rows[0]?.weekly_minutes ?? null;
}

/** Sets or clears the member's own goal. */
export async function setWeeklyGoal(personId: string, input: GoalInputType): Promise<Result> {
  const { error } = await companyOs
    .from("training_weekly_goals")
    .upsert({ person_id: personId, weekly_minutes: input.minutes }, { onConflict: "person_id" });
  if (error) return { ok: false, error: "Your goal could not be saved. Try again." };
  return { ok: true };
}
