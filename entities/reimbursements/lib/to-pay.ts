// What the payer sees on Home (Dave, 2026-10-12): every approved claim not yet
// paid, in a run or not, as one figure. The Home card asks this; its guard is
// reimbursements.pay, whose reach is every claim, so nothing here is narrowed
// to a person. A failed read throws (A.12): the card is hidden rather than
// drawn as "nothing to pay".
import { mustRows } from "@/kernel/data/read";
import { selectReimbursementClaims } from "./reads";

export type ToPayClaim = { personId: string; approvedTotalVnd: number; approvedAt: string | null };

export type ToPay = {
  /** Approved claims not yet paid. */
  claims: number;
  people: number;
  totalVnd: number;
  /** When the longest-waiting claim was approved; null when nothing waits. */
  oldestApprovedAt: string | null;
};

/** The waiting claims as one figure. Pure. */
export function summarizeToPay(claims: ToPayClaim[]): ToPay {
  const approvedAts = claims.map((c) => c.approvedAt).filter((at): at is string => at !== null).sort();
  return {
    claims: claims.length,
    people: new Set(claims.map((c) => c.personId)).size,
    totalVnd: claims.reduce((sum, c) => sum + c.approvedTotalVnd, 0),
    oldestApprovedAt: approvedAts[0] ?? null,
  };
}

/** Everything approved and not yet paid, whether or not a run holds it. */
export async function readToPay(): Promise<ToPay> {
  const rows = await selectReimbursementClaims("person_id, approved_total_vnd, approved_at").in("status", ["approved", "in_run"]);
  const claims = mustRows(rows, "[reimbursements] approved claims to pay").map((r) => ({
    personId: String(r.person_id),
    approvedTotalVnd: Number(r.approved_total_vnd ?? 0),
    approvedAt: (r.approved_at as string | null) ?? null,
  }));
  return summarizeToPay(claims);
}
