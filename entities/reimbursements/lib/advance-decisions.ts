// How a move on an advance keeps the kernel's approvals in step (AD.6, design section 6),
// private to advance-lifecycle, as claim-decisions is to the claim's. A submit opens the
// approval, addressed to whoever holds reimbursements.approve; a withdraw or a cancel
// takes it back; the approver's three moves settle it.
//
// The advance has already moved when this runs and the database holds the money rules,
// so nothing here can stop a move or fail it: the decision page reads the advance rather
// than the approval, so a lost row costs an Inbox line and never a decision. The kernel
// logs and audits its own failures; a failed read of the name only loses the name.
import { cancelApproval, openApproval } from "@/kernel/approvals/requests";
import { formatVndWhole } from "@/kernel/ui/format";
import { advanceRef, type AdvanceMove } from "./advance-rules";
import { settleApproval } from "./claim-decisions";
import { ownerName } from "./notices";

type Row = { id: string; refNo: number; personId: string; purpose: string; amountVnd: number; decidedBy?: string | null };
type Actor = { personId: string | null; label?: string | null };

async function askedBy(personId: string): Promise<string> {
  try {
    return await ownerName(personId);
  } catch (err) {
    console.error("[reimbursements] the asker's name was not read for the approval", personId, err instanceof Error ? err.message : err);
    return "Someone";
  }
}

export async function recordAdvanceApproval(input: { row: Row; move: AdvanceMove; actor: Actor; reason: string | null }): Promise<void> {
  const { row, move, actor, reason } = input;
  const subject = { subjectType: "reimbursement_advance" as const, subjectId: row.id };
  const who = actor.label ?? null;
  const ref = advanceRef(row.refNo);
  // Only a decision with nothing pending writes this: the pending row keeps the label it was opened with.
  const label = `Advance ${ref}`;
  try {
    switch (move) {
      case "submit":
        await openApproval(
          {
            ...subject,
            approverPermission: "reimbursements.approve",
            requestedBy: row.personId,
            label: `${await askedBy(row.personId)} asks for ${formatVndWhole(row.amountVnd)}`,
            metadata: { advanceId: row.id, ref, purpose: row.purpose, amountVnd: row.amountVnd },
          },
          who,
        );
        return;
      case "withdraw":
      case "cancel":
        // After an approval this appends a cancelled row, so the subject's answer stops
        // reading "approved" for money nobody will send.
        await cancelApproval({ ...subject, cancelledBy: actor.personId }, who);
        return;
      case "approve":
        await settleApproval({ ...subject, state: "approved", decidedBy: actor.personId, requestedBy: row.personId, label, metadata: { amountVnd: row.amountVnd } }, who);
        return;
      case "reinstate":
        // The cancel appended a cancelled row, so the subject's answer reads approved again, in
        // the name of whoever approved it. Finance putting it back is not a decision.
        await settleApproval({ ...subject, state: "approved", decidedBy: row.decidedBy ?? null, requestedBy: row.personId, label, metadata: { amountVnd: row.amountVnd, reinstatedBy: actor.personId } }, who);
        return;
      case "send_back":
      case "reject":
        await settleApproval({ ...subject, state: "rejected", decidedBy: actor.personId, requestedBy: row.personId, reason, label, metadata: { outcome: move === "send_back" ? "sent_back" : "rejected", amountVnd: row.amountVnd } }, who);
        return;
      default:
        return;
    }
  } catch (err) {
    console.error("[reimbursements] the approvals did not follow an advance's move", row.id, move, err instanceof Error ? err.message : err);
  }
}
