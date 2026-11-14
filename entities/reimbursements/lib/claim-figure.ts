// What a claim comes to (RB.29, CONTEXT.md "Claim total"), answered once. The queue, the
// decider's page, the approval, the decision mark and a trip's cost all read their figure
// here, so two screens cannot add the same receipts up by two rules. Each caller still
// reads its own rows; this module is given them and reads nothing.
//
// The rules it holds:
//   - a receipt its owner removed counts toward nothing (20261008090000);
//   - a declined receipt is left out of the total;
//   - a receipt still waiting for its rate counts as nothing in the sum, and the figure
//     says how many there are, so it is only what the claim comes to so far;
//   - approval freezes the total. After it, a claim's figure is that frozen total, except a
//     settlement's: an advance's settlement froze only what the company still owes, so its
//     figure stays what its receipts came to (what was spent), and what a run pays for it
//     is the frozen difference.
//
// Client-safe: no import reaches the server.
import { ALL_DECLINED, type ClaimStatus } from "./claim-rules";

/** One receipt as a figure counts it. */
export type FigureItem = { amountVnd: number | null; declined: boolean; removed?: boolean };

/** A receipt row as the reads select it, made into what a figure counts. */
export function figureItemOf(row: { amount_vnd?: unknown; declined_at?: unknown; removed_at?: unknown }): FigureItem {
  return {
    amountVnd: row.amount_vnd === null || row.amount_vnd === undefined ? null : Number(row.amount_vnd),
    declined: Boolean(row.declined_at),
    removed: Boolean(row.removed_at),
  };
}

const counted = (items: readonly FigureItem[]) => items.filter((i) => !i.removed);

/**
 * The receipts not declined, summed, how many were declined, and how many kept ones still
 * wait for a rate. A removed receipt is none of these. Pure.
 */
export function keptOf(items: readonly FigureItem[]): { totalVnd: number; declined: number; ratePending: number } {
  const still = counted(items);
  const kept = still.filter((i) => !i.declined);
  return {
    totalVnd: kept.reduce((sum, i) => sum + (i.amountVnd ?? 0), 0),
    declined: still.length - kept.length,
    ratePending: kept.filter((i) => i.amountVnd === null).length,
  };
}

// The statuses a claim's receipts can still change in, so no total is frozen yet.
const OPEN: ReadonlySet<ClaimStatus> = new Set<ClaimStatus>(["draft", "submitted", "sent_back"]);

export type ClaimFigure = {
  /** What the claim comes to: the frozen total once approved, and for a settlement what was spent. */
  totalVnd: number;
  /** What a payment run pays for it, frozen at approval (for a settlement, the difference); null until then. */
  paysVnd: number | null;
  /** Whether the figure is frozen, so nothing a receipt does can move it. */
  final: boolean;
  /** Kept receipts still waiting for a rate: while above zero the total is only so far. Zero once final. */
  ratePending: number;
  /** How many receipts are declined. */
  declined: number;
};

/** A claim's figure from its receipts and its state. Pure. */
export function claimFigure(claim: { status: ClaimStatus; items: readonly FigureItem[]; approvedTotalVnd: number | null; settles: boolean }): ClaimFigure {
  const kept = keptOf(claim.items);
  const final = claim.approvedTotalVnd !== null && !OPEN.has(claim.status);
  return {
    totalVnd: final && !claim.settles ? (claim.approvedTotalVnd as number) : kept.totalVnd,
    paysVnd: final ? claim.approvedTotalVnd : null,
    final,
    ratePending: final ? 0 : kept.ratePending,
    declined: kept.declined,
  };
}

/** What the approver hears when a kept receipt has no value yet: a total missing it would be paid short. */
export const NO_VND = "A receipt on this claim has no amount in VND yet, so its total cannot be approved.";

/**
 * Why these receipts cannot be approved yet, or null. Every receipt declined is a rejection,
 * not an approval at nothing, except on a settlement, which may decline everything: nothing
 * was spent and all of it comes back. A kept receipt still waiting for its rate refuses it.
 * Pure.
 */
export function approvalRefusal(items: readonly FigureItem[], opts: { settlement?: boolean } = {}): string | null {
  const still = counted(items);
  const kept = still.filter((i) => !i.declined);
  if (!opts.settlement && still.length > 0 && kept.length === 0) return ALL_DECLINED;
  if (kept.some((i) => i.amountVnd === null)) return NO_VND;
  return null;
}
