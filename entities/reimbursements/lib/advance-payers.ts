// Who records an advance's payout when the two rules against it would leave nobody. The approver
// does not record what they approved, and nobody records their own money. With two payers and one
// approver, the other payer's own advance would meet both: each refusal points at the other person,
// and the money could never be recorded. So the approver records it then, and only then. Two people
// still touch it, the one asking and the one approving, and the bank's receipt is still required.
import { peopleHolding } from "@/kernel/identity/people-holding";
import { ownMoneyRefusal, payOutRefusal } from "./advance-rules";

/** Whether the owner is the only payer besides this approver. A failed read answers no: the stricter rule stands. */
export async function ownerIsOnlyOtherPayer(ownerPersonId: string, approverPersonId: string): Promise<boolean> {
  try {
    const others = (await peopleHolding("reimbursements.pay")).filter((id) => id !== approverPersonId);
    return others.length === 1 && others[0] === ownerPersonId;
  } catch (err) {
    console.error("[reimbursements] who else can pay was not read", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Whether putting a cancelled advance back is refused to this payer: the rules of its payout, in the words of this step. */
export async function reinstateRefusalFor(advance: { decidedBy: string | null; personId: string }, payer: { personId: string | null }): Promise<string | null> {
  const refused = await payoutRefusalFor(advance, payer);
  if (!refused || payer.personId === null) return refused;
  return ownMoneyRefusal(advance, payer)
    ? "This is your own advance, so someone else in Finance puts it back and records its transfer."
    : "You approved this advance, so someone else puts it back and records its transfer.";
}

/** `payOutRefusal`, lifting only the approver's refusal, and only where nobody else could record it. Null when they may. */
export async function payoutRefusalFor(advance: { decidedBy: string | null; personId: string }, payer: { personId: string | null }): Promise<string | null> {
  const refused = payOutRefusal(advance, payer);
  if (!refused || payer.personId === null || ownMoneyRefusal(advance, payer) || advance.decidedBy !== payer.personId) return refused;
  return (await ownerIsOnlyOtherPayer(advance.personId, payer.personId)) ? null : refused;
}
