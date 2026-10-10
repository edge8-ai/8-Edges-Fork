// The words every view of a claim uses (design §1.5): how its history names
// each move, what its two kinds of document are called, and the shape of a
// claim id a page checks before it reads. One table for the owner's page, the
// checker's, and the approver's, payer's and admin's as their tickets arrive,
// so no two of them can name the same move differently.
//
// Client-safe: no import reaches the server.
import { formatDate } from "@/kernel/ui/format";
import { CLAIM_STATUS_LABEL, type ClaimStatus } from "./claim-rules";
import { formatOriginal } from "./currencies";

/** The two kinds of document a receipt carries. */
export const DOCUMENT_KIND_LABEL = { receipt: "Receipt", red_invoice: "Red invoice" } as const;
export type DocumentKind = keyof typeof DOCUMENT_KIND_LABEL;

/**
 * The AI reading's warnings (design §1.9), as the ai_flags check constraint
 * spells them, in the words the owner and the checker read. A warning, never
 * a decision: none of them stops a submit or a check.
 */
export const RECEIPT_FLAG_LABEL = {
  buyer_not_organisation: "The red invoice is not made out to the organisation.",
  buyer_tax_code_differs: "The red invoice's buyer tax code is not the organisation's.",
  unreadable: "The reader could not make out this document. Check it by eye.",
  possible_duplicate: "This may be a receipt that is already claimed.",
  older_than_90_days: "Bought more than 90 days ago.",
  not_a_red_invoice: "Filed as a red invoice, but the reader says it is not one.",
} as const;
export type ReceiptFlag = keyof typeof RECEIPT_FLAG_LABEL;

/** The stored flags a page can name; anything else in the column is left out rather than shown raw. */
export function receiptFlagsOf(value: unknown): ReceiptFlag[] {
  return Array.isArray(value) ? value.filter((f): f is ReceiptFlag => typeof f === "string" && f in RECEIPT_FLAG_LABEL) : [];
}

const CLAIM_ID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` has a claim id's shape, so a page answers 404 without reading. */
export function isClaimId(id: string): boolean {
  return CLAIM_ID.test(id);
}

/** An item's money as the rate line reads it. `amount` is in the currency's minor units. */
export type ItemMoney = {
  amount: number;
  currency: string;
  amountVnd: number | null;
  fxRate: number | null;
  fxSource: string;
  fxAsOf: string | null;
};

const BANK_NAME: Record<string, string> = { techcombank: "Techcombank", vietcombank: "Vietcombank" };
const rateText = (rate: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(rate);

/**
 * How a receipt abroad came to its VND value (RB.10), for everyone who reads
 * the claim: the amount as it was paid and the rate behind the figure, or
 * that the rate is pending. Null for a dong receipt, which is its own value.
 */
export function rateLine(item: ItemMoney): string | null {
  if (item.currency.toLowerCase() === "vnd") return null;
  const original = formatOriginal(item.amount, item.currency);
  if (item.amountVnd === null) return `${original}, rate pending`;
  if (item.fxSource === "card") return `${original}, as the card charged it`;
  const rate = item.fxRate === null ? "" : rateText(item.fxRate);
  if (item.fxSource === "manual") return `${original} at ${rate}, a rate entered by a checker`;
  const bank = BANK_NAME[item.fxSource];
  if (!bank) return original;
  return `${original} at ${bank}'s selling rate of ${rate}${item.fxAsOf ? ` on ${formatDate(item.fxAsOf)}` : ""}`;
}

/** One line of a claim's history: the move from one status to the next. */
export function describeClaimEvent(e: { from: ClaimStatus | null; to: ClaimStatus }): string {
  if (e.from === null) return "Started";
  if (e.to === "submitted") return e.from === "sent_back" ? "Resubmitted" : "Submitted";
  if (e.to === "draft") return "Withdrawn to draft";
  if (e.to === "in_run") return "Added to a payment run";
  if (e.to === "approved" && e.from === "in_run") return "Payment returned; waiting for the next run";
  return CLAIM_STATUS_LABEL[e.to];
}

/**
 * The moves a claim's history card draws (RB.19, Khoa and Mai): Submitted or
 * Resubmitted, Checked, Sent back, Rejected, Approved, Paid. The draft's start,
 * a withdrawal, entering a payment run and a returned payment stay in the
 * events table for the audit trail, but are noise on the card. Order kept.
 */
export function historyMilestones<E extends { from: ClaimStatus | null; to: ClaimStatus }>(events: E[]): E[] {
  return events.filter(
    (e) =>
      e.from !== null &&
      (e.to === "submitted" || e.to === "checked" || e.to === "sent_back" || e.to === "rejected" || e.to === "paid" || (e.to === "approved" && e.from === "checked")),
  );
}

/** Days after which a waiting claim is marked in the queues (RB.14): a claim older than this has waited too long. */
export const STALE_AFTER_DAYS = 3;

/**
 * How long a claim has waited at its stage, as a queue row reads it, and
 * whether that is past `STALE_AFTER_DAYS`. Whole days, counted from when it
 * reached the stage to `now`. Pure.
 */
export function waitingFor(stageAt: string | null, now: Date = new Date()): { label: string; stale: boolean } | null {
  if (!stageAt) return null;
  const since = new Date(stageAt).getTime();
  if (Number.isNaN(since)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - since) / 86_400_000));
  return { label: days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`, stale: days > STALE_AFTER_DAYS };
}
