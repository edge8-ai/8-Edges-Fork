import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { countSprintCommits, type SprintMove } from "./carry-history";
import { readInChunks } from "./in-chunks";

// The read behind the carried-weeks hint (W.52). It is separate from
// carry-history.ts because the threshold and the counting are wanted in the
// browser, on the planning card, and this file names the service-role client.

/**
 * Sprint-commit counts for the given cards, keyed by task id.
 *
 * A failure costs the hint and nothing else — the planning page still draws
 * every card, every column and every total — so the fallback is an empty map,
 * named here rather than implied by a `?? []`.
 */
export async function readSprintCommitCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  const rows = await readOr(
    await readInChunks(taskIds, (ids) =>
      companyOs.from("task_stage_log").select("task_id, to_sprint_id").in("task_id", ids).not("to_sprint_id", "is", null),
    ),
    "[boards/planning] task_stage_log sprint moves",
    [] as SprintMove[],
  );
  return countSprintCommits(rows as SprintMove[]);
}
