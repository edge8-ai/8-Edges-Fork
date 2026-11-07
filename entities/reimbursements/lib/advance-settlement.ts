// How a claim closes an advance, and how a person returns one unspent (AD.8, design section
// 3). A settlement is an ordinary claim with advance_id set, and a close changes two rows
// with no transaction across them, so the order makes a failure retryable: the advance
// first, then the claim. This is the advance's half, which claim-lifecycle calls on approve.
//
// Authorization stays with the caller (ADR 0007).
import { advanceWriterFor, advanceRowFrom, transitionAdvance, type AdvanceActor, type AdvanceRow } from "./advance-lifecycle";
import type { ClaimActor } from "./claim-lifecycle";
import { selectReimbursementAdvances, selectReimbursementAdvanceTransfers, selectReimbursementClaims } from "./reads";
import { closeOf, settlementApprovedOnCheck } from "./settlement-rules";

/** What was paid out, from the ledger: the transfer is the truth of what the person received. */
async function advancedOf(advanceId: string): Promise<{ ok: true; amountVnd: number } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementAdvanceTransfers("amount_vnd").eq("advance_id", advanceId).eq("direction", "out");
  if (error) return { ok: false, error: `Could not read the advance's transfer: ${error.message}` };
  const out = (data ?? [])[0];
  return out ? { ok: true, amountVnd: Number(out.amount_vnd) } : { ok: false, error: "This advance has no transfer on its ledger, so there is nothing to settle." };
}

/** Whether the check alone approves this settlement. An advance that cannot be read leaves it with the approver. */
export async function settlementApprovesOnCheck(advanceId: string, spentVnd: number): Promise<boolean> {
  const advanced = await advancedOf(advanceId);
  return advanced.ok && settlementApprovedOnCheck(spentVnd, advanced.amountVnd);
}

/**
 * `approvedAs` says whether the approver decided it or a check under the limit approved it in the
 * same move, because the paper it prints on signs those two differently.
 *
 * Closes the advance on what its settlement's kept receipts came to, and answers what the
 * claim must freeze and where it lands. Already closed by this claim on these figures is a
 * retry after a lost claim write, so it answers the same. Closed any other way is refused.
 */
export async function closeAdvance(input: { claimId: string; advanceId: string; spentVnd: number; actor: ClaimActor; approvedAs?: "approval" | "check" }): Promise<{ ok: true; payableVnd: number; claimStatus: "approved" | "settled" } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementAdvances("id, ref_no, status, person_id, purpose, amount_vnd, spend_ends_on, settle_by, submitted_at, decided_by, balance_vnd, spent_vnd, settled_claim_id").eq("id", input.advanceId).maybeSingle();
  if (error) return { ok: false, error: `Could not read the advance: ${error.message}` };
  const row = data ? advanceRowFrom(data) : null;
  if (!data || !row) return { ok: false, error: "The advance this claim settles was not found." };
  const advanced = await advancedOf(row.id);
  if (!advanced.ok) return advanced;
  const close = closeOf(input.spentVnd, advanced.amountVnd);
  const answer = { ok: true as const, payableVnd: close.payableVnd, claimStatus: close.claimStatus };

  if (row.status !== "paid_out") {
    const sameClose = data.settled_claim_id === input.claimId && Number(data.spent_vnd) === input.spentVnd;
    return sameClose ? answer : { ok: false, error: "This advance is already closed another way. Ask Finance to look at it." };
  }
  const moved = await transitionAdvance({
    row,
    move: "close",
    actor: { kind: "system", personId: input.actor.personId, mayDecideOwn: false, label: input.actor.label },
    write: advanceWriterFor(row.id, {}),
    facts: { spentVnd: close.spentVnd, balanceVnd: close.balanceVnd, settledClaimId: input.claimId, metadata: { claimId: input.claimId, spentVnd: close.spentVnd, approvedAs: input.approvedAs ?? "approval" } },
  });
  return moved.ok ? answer : moved;
}

/**
 * "I spent none of it": the whole amount is owed back, with no claim. Refused while a
 * settlement exists, draft included, because the person has said they spent some of it; they
 * delete that draft first, or settle through it.
 */
export async function returnUnspent(input: { row: AdvanceRow; actor: AdvanceActor }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { row, actor } = input;
  const { data, error } = await selectReimbursementClaims("id").eq("advance_id", row.id).limit(1);
  if (error) return { ok: false, error: `Could not read the settlement: ${error.message}` };
  if ((data ?? []).length > 0) return { ok: false, error: "You have started a settlement for this advance. Delete it first, or finish it." };
  const advanced = await advancedOf(row.id);
  if (!advanced.ok) return advanced;
  return transitionAdvance({
    row,
    move: "return_unspent",
    actor,
    write: advanceWriterFor(row.id, { ownedBy: row.personId }),
    facts: { spentVnd: 0, balanceVnd: -advanced.amountVnd, metadata: { spentVnd: 0 } },
  });
}

/** The claim settling an advance, if one has been started. A failed read raises: "none" would start a second one. */
export async function settlementClaimOf(advanceId: string): Promise<string | null> {
  const { data, error } = await selectReimbursementClaims("id").eq("advance_id", advanceId).limit(1);
  if (error) throw new Error(`[reimbursements] an advance's settlement: ${error.message}`);
  return (data ?? [])[0] ? String((data ?? [])[0].id) : null;
}

/** The event an advance was asked for, which its settlement claim carries too. A failed read raises. */
export async function advanceTripOf(advanceId: string): Promise<string | null> {
  const { data, error } = await selectReimbursementAdvances("trip_event_id").eq("id", advanceId).maybeSingle();
  if (error) throw new Error(`[reimbursements] an advance's event: ${error.message}`);
  return (data?.trip_event_id as string | null | undefined) ?? null;
}
