import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { bumpsThisQuarter, goalMoveSince, type GoalBumpRow, type GoalMoveRow } from "../goal-bumps";

// The audit trail's name for a goal bump (K.42). `audit_log.table_name` is a
// label on the trail, not a foreign key, and this one says which kind of
// record moved rather than which physical table holds it: `goals` is shared
// with the company tree, and the coaching goal is the thing the caption is
// about.
export const GOAL_AUDIT_TABLE = "coaching_goals";

// How many times this goal's number has been bumped since the quarter began.
// `audit_log` is a kernel table — readable by every entity, written only
// through kernel/audit — so this read names it directly and nothing here
// writes it.
//
// A read error returns 0 rather than throwing: the caption is a grace note
// under the number, and losing it must never take the goal rung down with it.
export async function getGoalBumpsThisQuarter(goalId: string): Promise<number> {
  if (!goalId) return 0;
  const { data, error } = await companyOs
    .from("audit_log")
    .select("changed_at")
    .eq("table_name", GOAL_AUDIT_TABLE)
    .eq("record_id", goalId)
    .eq("operation", "update");
  if (error) {
    console.error("[team/coaching/goal-bumps] audit_log", error);
    return 0;
  }
  return bumpsThisQuarter((data ?? []) as unknown as GoalBumpRow[], saigonToday());
}

// The same facts for a whole tab's worth of goals in one read (K.62). The My
// FAST Goals tab draws a card per goal and each card says how often its number
// moved and when it last did, so a per-goal query would be one round trip per
// card; this is one.
//
// Like the single reader above, a read error is an empty map rather than a
// throw: the F line is a grace note under the goal and must never take the tab
// down with it.
export type GoalBumpFacts = { count: number; lastAt: string | null };

export async function getGoalBumpFacts(goalIds: string[]): Promise<Map<string, GoalBumpFacts>> {
  const out = new Map<string, GoalBumpFacts>();
  const ids = goalIds.filter(Boolean);
  if (ids.length === 0) return out;
  const { data, error } = await companyOs
    .from("audit_log")
    .select("record_id, changed_at")
    .eq("table_name", GOAL_AUDIT_TABLE)
    .eq("operation", "update")
    .in("record_id", ids);
  if (error) {
    console.error("[team/coaching/goal-bumps] audit_log", error);
    return out;
  }
  const today = saigonToday();
  const rows = (data ?? []) as unknown as { record_id: string | null; changed_at: string | null }[];
  for (const id of ids) {
    const mine = rows.filter((r) => r.record_id === id);
    const stamps = mine.map((r) => r.changed_at).filter((at): at is string => typeof at === "string");
    out.set(id, {
      count: bumpsThisQuarter(mine, today),
      // The query does not order the trail, so the latest stamp is taken here
      // rather than trusted from the row order.
      lastAt: stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null,
    });
  }
  return out;
}

// The active goal's move since the last held 1-1, for the "Since Tuesday" line
// (K.44). Same trail, same grace-note rule: a read error is null, never a throw.
export async function getGoalMoveSince(goalId: string, sinceISO: string): Promise<{ before: number; after: number } | null> {
  if (!goalId) return null;
  const { data, error } = await companyOs
    .from("audit_log")
    .select("changed_at, old_data, new_data")
    .eq("table_name", GOAL_AUDIT_TABLE)
    .eq("record_id", goalId)
    .eq("operation", "update")
    .gt("changed_at", `${sinceISO}T23:59:59Z`);
  if (error) {
    console.error("[team/coaching/goal-bumps] audit_log", error);
    return null;
  }
  return goalMoveSince((data ?? []) as unknown as GoalMoveRow[], sinceISO);
}
