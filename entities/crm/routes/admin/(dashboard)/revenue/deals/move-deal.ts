import type { Result } from "@/kernel/data/result";
import { decideHandoff, moveDealStage } from "./actions";

/**
 * Moves a deal to a stage, accepting its SDR handoff first when that is still
 * pending, so choosing a stage also accepts. The board and the deal page both
 * do this, and it was written out once in each until A.33 gave it one name.
 * A refused acceptance stops the move and is returned as it is.
 */
export function moveDealAccepting(
  dealId: string,
  stageId: string,
  { handoffPending, lostReason, wonAmount }: { handoffPending: boolean; lostReason?: string; wonAmount?: number },
): Promise<Result> {
  if (!handoffPending) return moveDealStage(dealId, stageId, lostReason, wonAmount);
  return decideHandoff(dealId, "accepted").then((r) => (r.ok ? moveDealStage(dealId, stageId, lostReason, wonAmount) : r));
}
