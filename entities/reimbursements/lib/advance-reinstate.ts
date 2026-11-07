// Putting a cancelled advance back (AD.16, finding 2). An owner can cancel an approved advance
// after Finance has already made the bank transfer, and the ledger takes a payout only on an
// approved advance, so without this that money could never be recorded. Finance says what happened,
// the advance goes back to approved, and the payout is then recorded the ordinary way, receipt and all.
import type { Result } from "@/kernel/data/result";
import { moveHappened } from "./advance-history";
import { advanceWriterFor, transitionAdvance, type AdvanceActor, type AdvanceRow } from "./advance-lifecycle";
import { reinstateRefusalFor } from "./advance-payers";

export async function reinstateAdvance(input: { row: AdvanceRow; reason: string; actor: AdvanceActor }): Promise<Result> {
  const { row, reason, actor } = input;
  if (actor.kind !== "payer" || actor.personId === null) return { ok: false, error: "Only Finance can put an advance back." };
  const refused = await reinstateRefusalFor(row, actor);
  if (refused) return { ok: false, error: refused };
  // Once approved, an advance only leaves by a payout or a cancel, so an approve in its history
  // on a cancelled advance is the cancel this exists for. Nobody can have sent one never approved.
  if (row.status === "cancelled" && !(await moveHappened(row.id, "approve"))) return { ok: false, error: "Nobody approved this advance, so no money can have gone." };
  return transitionAdvance({ row, move: "reinstate", actor, write: advanceWriterFor(row.id, {}), reason });
}
