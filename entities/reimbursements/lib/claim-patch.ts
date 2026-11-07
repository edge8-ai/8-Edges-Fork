// What a landed move writes onto a claim, and what its history row keeps. Split from
// claim-lifecycle.ts for size alone: only the lifecycle calls these, and it is still the only
// code that writes a claim's status.
import type { ClaimMove, ClaimStatus } from "./claim-rules";

/** What a move writes onto the claim: its status, and the stamps and links each move carries. */
export type ClaimPatch = {
  status: ClaimStatus;
  submitted_at?: string;
  checked_at?: string;
  checked_by?: string | null;
  approved_at?: string;
  approved_by?: string | null;
  /** The kept receipts' total in whole VND, frozen at approval: the payment run reads it and never recomputes it. */
  approved_total_vnd?: number;
  /** The run that took the claim (enter_run), cleared when a failed transfer returns it (return_to_approved). */
  payment_run_id?: string | null;
  in_run_at?: string;
  /** The payment that paid it (pay), cleared with the run on a return. */
  payment_id?: string | null;
  paid_at?: string;
};

/** The run and the payment a payment-run move is about, handed in by the payment-runs and payments modules. */
export type Links = { runId: string | null; paymentId: string | null };

/**
 * The patch a landed move writes. Withdraw writes the status alone:
 * `submitted_at` stays. Approve stamps who and when, and freezes the total it
 * was handed (read before the write, see approvedTotalOf). Entering a run
 * links the claim to it; paying links it to its payment; a return unlinks
 * both, so the next run picks the claim up again (design §2.3).
 */
export function patchFor(move: ClaimMove, to: ClaimStatus, actor: { personId: string | null }, approvedTotalVnd: number | null, links: Links): ClaimPatch {
  const now = new Date().toISOString();
  if (move === "submit") return { status: to, submitted_at: now };
  if (move === "check") return { status: to, checked_at: now, checked_by: actor.personId };
  if (move === "approve" && approvedTotalVnd !== null) return { status: to, approved_at: now, approved_by: actor.personId, approved_total_vnd: approvedTotalVnd };
  if (move === "enter_run") return { status: to, in_run_at: now, payment_run_id: links.runId };
  if (move === "pay") return { status: to, paid_at: now, ...(links.paymentId ? { payment_id: links.paymentId } : {}) };
  if (move === "return_to_approved") return { status: to, payment_run_id: null, payment_id: null };
  return { status: to };
}

/** The detail a history row keeps: the total frozen at approval, the run and the payment. Undefined when there is none. */
export function historyMetadata(m: { approvedTotalVnd: number | null } & Links): Record<string, string | number> | undefined {
  const out: Record<string, string | number> = {};
  if (m.approvedTotalVnd !== null) out.approvedTotalVnd = m.approvedTotalVnd;
  if (m.runId) out.runId = m.runId;
  if (m.paymentId) out.paymentId = m.paymentId;
  return Object.keys(out).length > 0 ? out : undefined;
}
