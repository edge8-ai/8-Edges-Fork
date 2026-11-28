// How Finance reads advances (AD.7): which tab each one sits under, the figures across
// them, and one advance's account 141. Pure and client-safe, so the export (AD.10) adds
// up the same way the page does.
//
// Account 141 holds what a person has been given and not yet accounted for. It goes up
// by the payout, and down by the receipts accepted and the money returned. Receipts above
// the advance do not touch it: the difference is a claim the company pays through its run,
// so the credit stops at the amount, and a settled advance always ends on zero.
import { owedOf } from "./advance-card";
import { isOverdue, isSettling, type AdvanceStatus } from "./advance-rules";

export const ADVANCE_TABS = [
  { key: "pay", label: "To transfer" },
  { key: "out", label: "With people" },
  { key: "settle", label: "Settlements to check" },
  { key: "back", label: "Coming back" },
  { key: "before", label: "Before approval" },
  { key: "closed", label: "Closed" },
] as const;
type AdvanceTab = (typeof ADVANCE_TABS)[number]["key"];

export function isAdvanceTab(value: unknown): value is AdvanceTab {
  return ADVANCE_TABS.some((t) => t.key === value);
}

/** The tab an advance sits under. Every status lands on exactly one, so none can go missing from the queue. */
export function tabOf(a: { status: AdvanceStatus; claimStatus: string | null }): AdvanceTab {
  switch (a.status) {
    case "approved":
      return "pay";
    case "paid_out":
      return isSettling(a) ? "settle" : "out";
    case "to_return":
      return "back";
    case "draft":
    case "submitted":
    case "sent_back":
      return "before";
    case "rejected":
    case "cancelled":
    case "settled":
      return "closed";
  }
}

type QueueFigures = { putBack?: boolean; status: AdvanceStatus; amountVnd: number; balanceVnd: number | null; returnedVnd: number; claimStatus: string | null; settleBy: string | null };

/** The four figures above the queue. "With people" is account 141's balance across everyone. */
export function queueFigures(rows: readonly QueueFigures[], today: string): { toTransferVnd: number; withPeopleVnd: number; comingBackVnd: number; overdue: number } {
  const out = { toTransferVnd: 0, withPeopleVnd: 0, comingBackVnd: 0, overdue: 0 };
  for (const r of rows) {
    // One Finance put back has already gone, and counting it invites a second transfer.
    if (r.status === "approved" && !r.putBack) out.toTransferVnd += r.amountVnd;
    if (r.status === "paid_out") out.withPeopleVnd += r.amountVnd;
    if (r.status === "to_return") {
      const owed = owedOf(r);
      out.withPeopleVnd += owed;
      out.comingBackVnd += owed;
    }
    if (isOverdue(r, today)) out.overdue += 1;
  }
  return out;
}

/**
 * Whether an advance was closed by a settlement that has not been approved. The close writes
 * the advance first, so a lost claim write leaves this for a moment, and it must be seen
 * rather than sit silent: approving the claim again finishes it.
 */
export function closedAheadOfClaim(a: { status: AdvanceStatus; spentVnd: number | null; claimStatus: string | null }): boolean {
  if (a.spentVnd === null || (a.status !== "settled" && a.status !== "to_return") || a.claimStatus === null) return false;
  return !["approved", "settled", "in_run", "paid"].includes(a.claimStatus);
}

/** The month before a Vietnam business date's, as YYYY-MM. */
export function previousMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export type BookTransfer = { direction: "out" | "in"; amountVnd: number; transferredOn: string };
export type BookEntry = { on: string | null; what: string; debitVnd: number | null; creditVnd: number | null };

/**
 * One advance's account 141, in the order it happened. `closedOn` is null only when the
 * close's history row was lost, and the entry then shows no date rather than a guessed one.
 */
export function accountOf(a: { amountVnd: number; spentVnd: number | null; closedOn: string | null; transfers: readonly BookTransfer[] }): { entries: BookEntry[]; balanceVnd: number } {
  const entries: BookEntry[] = [];
  for (const t of a.transfers) {
    if (t.direction === "out") entries.push({ on: t.transferredOn, what: "Payout · Nợ 141 / Có 112", debitVnd: t.amountVnd, creditVnd: null });
  }
  if (a.spentVnd !== null) {
    entries.push({ on: a.closedOn, what: a.spentVnd > 0 ? "Settlement · receipts kept" : "Nothing spent", debitVnd: null, creditVnd: Math.min(a.spentVnd, a.amountVnd) });
  }
  for (const t of a.transfers) {
    if (t.direction === "in") entries.push({ on: t.transferredOn, what: "Returned by transfer · Nợ 112 / Có 141", debitVnd: null, creditVnd: t.amountVnd });
  }
  return { entries, balanceVnd: entries.reduce((sum, e) => sum + (e.debitVnd ?? 0) - (e.creditVnd ?? 0), 0) };
}
