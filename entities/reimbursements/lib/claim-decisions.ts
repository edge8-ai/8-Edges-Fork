// The decisions' bookkeeping, private to the lifecycle module (design §2.3,
// "recordDecision"): what a check or an approval reads before it writes — the
// declined receipts, and for an approval the total it freezes — and how a move
// that landed keeps the kernel's approvals in step (§1.3). Split from
// claim-lifecycle.ts for size alone; nothing outside it imports this file, and
// the entity's doors export none of it, because exporting the helpers behind a
// transition is how time-off's surfaces came to pick wrong (A.30).
import { cancelApproval, decideApproval, decidePendingApproval, openApproval, type ApprovalRef } from "@/kernel/approvals/requests";
import { ALL_DECLINED, decidingStep, type ClaimMove } from "./claim-rules";
import { stillCounted } from "./retention-rules";
import type { ClaimActor } from "./claim-lifecycle";
import type { ClaimRow } from "./own-claims";
import { selectReimbursementClaimItems } from "./reads";

// The moves a checker or the approver makes: each settles a pending approval.
export const DECISIONS: ReadonlySet<ClaimMove> = new Set<ClaimMove>(["check", "send_back", "reject", "approve"]);

/**
 * The items declined on a claim, which a decision carries into its history row
 * and its approval. Read before the write, so a failed read refuses the move
 * rather than recording a decision without them. A receipt its owner removed
 * is not part of the decision, declined before or not.
 */
export async function declinedItemsOf(claimId: string): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementClaimItems("id, removed_at").eq("claim_id", claimId).not("declined_at", "is", null);
  if (error) return { ok: false, error: `Could not read the claim's receipts: ${error.message}` };
  return { ok: true, ids: stillCounted(data ?? []).map((i) => String(i.id)) };
}

const NO_VND = "A receipt on this claim has no amount in VND yet, so its total cannot be approved.";

/**
 * What an approval freezes (design §2.3): the receipts not declined, summed in
 * whole VND, and the declined ids the approval carries. One read before the
 * write, so the total and the declined list come from the same rows. A kept
 * receipt with no VND amount (a foreign one still waiting for its rate)
 * refuses the approval: a total missing a receipt would be paid short. A
 * receipt its owner removed (20261008090000) counts toward none of it, so the
 * total the run pays never includes one.
 */
export async function approvedTotalOf(claimId: string): Promise<{ ok: true; totalVnd: number; declinedIds: string[] } | { ok: false; error: string }> {
  const { data, error } = await selectReimbursementClaimItems("id, amount_vnd, declined_at, removed_at").eq("claim_id", claimId);
  if (error) return { ok: false, error: `Could not read the claim's receipts: ${error.message}` };
  const items = stillCounted(data ?? []);
  const kept = items.filter((i) => !i.declined_at);
  if (items.length > 0 && kept.length === 0) return { ok: false, error: ALL_DECLINED };
  if (kept.some((i) => i.amount_vnd === null || i.amount_vnd === undefined)) return { ok: false, error: NO_VND };
  return {
    ok: true,
    totalVnd: kept.reduce((sum, i) => sum + Number(i.amount_vnd), 0),
    declinedIds: items.filter((i) => i.declined_at).map((i) => String(i.id)),
  };
}

/**
 * The approvals bookkeeping for a move that landed (design §1.3): submit opens
 * the check, addressed to whoever holds reimbursements.check; withdraw cancels
 * it; the check settles it and opens the approval, addressed to whoever holds
 * reimbursements.approve; send back and reject settle the pending one as
 * rejected, with the outcome and the reason. The kernel's writes answer a
 * Result and never throw, and log and audit a failure themselves: the claim
 * has moved, so the move still answers ok.
 */
async function settle(
  ref: ApprovalRef & { state: "approved" | "rejected"; decidedBy: string | null; requestedBy: string; reason?: string | null; label: string; metadata: Record<string, unknown> },
  who: string | null,
) {
  // The pending row takes the decision with its metadata merged in, so the
  // declined ids and the outcome ride on the row that was waiting.
  // decideApproval would close it but drop the metadata.
  const pending = await decidePendingApproval(ref, who);
  if (pending.ok && pending.decided) return;
  // Nothing was pending: a claim submitted before RB.3 opened checks, or a
  // read that failed (already logged and audited). Leave one decided row, so
  // every decision has its record.
  if (pending.ok) await decideApproval(ref, who);
}

export async function recordDecision(input: {
  row: ClaimRow;
  move: ClaimMove;
  actor: ClaimActor;
  reason: string | null;
  declinedItemIds: string[];
  approvedTotalVnd: number | null;
}) {
  const { row, move, actor } = input;
  const check = { subjectType: "reimbursement_check" as const, subjectId: row.id };
  const approval = { subjectType: "reimbursement_approval" as const, subjectId: row.id };
  const who = actor.label ?? null;
  const declined = input.declinedItemIds.length ? { declinedItemIds: input.declinedItemIds } : {};
  switch (move) {
    case "submit":
      await openApproval(
        { ...check, approverPermission: "reimbursements.check", requestedBy: row.personId, label: `Check claim: ${row.title}`, metadata: { claimId: row.id } },
        who,
      );
      return;
    case "withdraw":
      await cancelApproval({ ...check, cancelledBy: actor.personId }, who);
      return;
    case "check":
      await settle(
        { ...check, state: "approved", decidedBy: actor.personId, requestedBy: row.personId, label: `Check claim: ${row.title}`, metadata: declined },
        who,
      );
      // Addressed to a permission RB.4 declares; until then nobody holds it and
      // the approval waits, so a claim checked before RB.4 still reaches its
      // approver's "Waiting on you" without a backfill.
      await openApproval(
        { ...approval, approverPermission: "reimbursements.approve", requestedBy: row.personId, label: `Approve claim: ${row.title}`, metadata: { claimId: row.id } },
        who,
      );
      return;
    case "approve":
      await settle(
        {
          ...approval,
          state: "approved",
          decidedBy: actor.personId,
          requestedBy: row.personId,
          label: `Approve claim: ${row.title}`,
          metadata: { approvedTotalVnd: input.approvedTotalVnd, ...declined },
        },
        who,
      );
      return;
    case "send_back":
    case "reject": {
      const atApproval = decidingStep(row.status) === "approval";
      await settle(
        {
          ...(atApproval ? approval : check),
          state: "rejected",
          decidedBy: actor.personId,
          requestedBy: row.personId,
          reason: input.reason,
          label: `${atApproval ? "Approve" : "Check"} claim: ${row.title}`,
          metadata: { outcome: move === "send_back" ? "sent_back" : "rejected", ...declined },
        },
        who,
      );
      return;
    }
    default:
      return;
  }
}
