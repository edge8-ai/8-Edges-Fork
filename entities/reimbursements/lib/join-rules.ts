// Joining a document that came in on its own to the receipt it belongs to
// (RB.26). Every file goes in through the one drop zone, so each lands as its
// own row: a bank deduction (the bank's record of what it took in dong, RB.20)
// and a red invoice (the Vietnamese VAT invoice, RB.2) as well as receipts.
// The owner joins a lone bank deduction to the receipt abroad it paid for, and
// a lone red invoice to the Vietnamese receipt it invoices, whichever came
// first. Until then the two rows are two purchases, each paid. Nothing joins by
// itself (Khoa, 2026-11-06: "auto join is annoying"): the page offers the
// receipts a row may join, nearest first, and the owner picks.
//
// Pure, and free of entity imports, so the claim page's client components and
// the submit rule (claim-rules, which claim-labels imports) read the same
// rules the join command refuses on, with no import cycle.
import { diffDays } from "@/kernel/config/dates";
import { foldDiacritics } from "@/kernel/config/fold";

/**
 * A document as these rules see it: its kind (DocumentKind), and whether its
 * owner set it aside for another. Callers hold that last fact in one of two
 * shapes, a stored document as its `replacedAt` stamp and the submit rule
 * (claim-rules SubmitDocument) as a `replaced` flag. The rules read either as
 * it comes, so no caller has to invent a stamp it does not have.
 */
export type JoinDocument = { kind: string; replacedAt: string | null } | { kind: string; replaced: boolean };

/** What a row on its own joins a receipt as. */
export type JoinKind = "bank_deduction" | "red_invoice";

/** The words the join control says before the receipt picker. */
export const JOIN_LABEL: Record<JoinKind, string> = { bank_deduction: "Paid for", red_invoice: "Red invoice for" };

const isCurrent = (d: JoinDocument) => ("replaced" in d ? !d.replaced : d.replacedAt === null);
const current = (docs: JoinDocument[]) => docs.filter(isCurrent);
const isJoinKind = (kind: string): kind is JoinKind => kind === "bank_deduction" || kind === "red_invoice";

/** The kind a row is on its own: every current document a bank deduction, or every one a red invoice. Null otherwise. */
export function loneKind(docs: JoinDocument[]): JoinKind | null {
  const now = current(docs);
  const kind = now[0]?.kind;
  if (kind === undefined || !isJoinKind(kind)) return null;
  return now.every((d) => d.kind === kind) ? kind : null;
}

/** A row that is a bank deduction on its own, waiting to be joined to its receipt. */
export function isLoneDeduction(docs: JoinDocument[]): boolean {
  return loneKind(docs) === "bank_deduction";
}

/**
 * Whether a receipt carries a joined document of this kind: a current bank
 * deduction beside another current document, or a current red invoice beside a
 * current receipt. Such a document is the one Edit offers to Unjoin.
 */
export function hasJoined(docs: JoinDocument[], kind: JoinKind): boolean {
  const now = current(docs);
  const other = kind === "bank_deduction" ? (d: JoinDocument) => d.kind !== kind : (d: JoinDocument) => d.kind === "receipt";
  return now.some((d) => d.kind === kind) && now.some(other);
}

export function hasJoinedDeduction(docs: JoinDocument[]): boolean {
  return hasJoined(docs, "bank_deduction");
}

/**
 * A receipt as the join picker lists it. `amount` is in its currency's minor
 * units. `removed` is read as the caller holds it, a flag or the claim page's
 * removal record (null while the receipt counts), so the page can pass its
 * own rows and `joinTargets` hands those same rows back, with nothing copied
 * and nothing looked up again.
 */
export type JoinableItem = {
  id: string;
  label: string;
  seller: string | null;
  boughtOn: string | null;
  currency: string;
  amount: number;
  removed: boolean | { at: string } | null;
  documents: JoinDocument[];
};

/**
 * A name's words as a bank, a seller and an invoice all spell them: no
 * accents, no case, no punctuation, three letters or more. The fold is the
 * kernel's, the one the duplicate check's names use too (receipt-reading
 * nameKey), so two spellings of one seller compare alike everywhere.
 */
function words(name: string | null): Set<string> {
  return new Set(foldDiacritics(name ?? "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3));
}

const daysApart = (a: string | null, b: string | null) => (a && b ? Math.abs(diffDays(a, b)) : Number.POSITIVE_INFINITY);

/** Whether a receipt can take a document of this kind: not removed, not a lone row itself, in the right currency, with none of that kind yet. */
function takes(item: JoinableItem, kind: JoinKind): boolean {
  if (item.removed || loneKind(item.documents) !== null) return false;
  if (current(item.documents).some((d) => d.kind === kind)) return false;
  // A dong receipt is its own value, so a bank deduction proves nothing there; a red invoice exists only in Vietnam, in dong.
  return kind === "bank_deduction" ? item.currency.toLowerCase() !== "vnd" : item.currency.toLowerCase() === "vnd";
}

/**
 * The receipts a lone row may join, ordered for the picker, nearest first: for
 * a red invoice, the receipt of the same amount; then the seller the document
 * names ("ANTHROPIC* CLAUDE SUB" names Anthropic, PBC); then the nearest date,
 * since a bank books a card payment a day or two late. A suggestion of order
 * only; the owner picks.
 */
export function joinTargets<T extends JoinableItem>(lone: { seller: string | null; boughtOn: string | null; amount: number }, kind: JoinKind, items: T[]): T[] {
  const loneWords = words(lone.seller);
  const shared = (item: T) => [...words(item.seller)].filter((w) => loneWords.has(w)).length;
  const sameAmount = (item: T) => (kind === "red_invoice" && item.amount === lone.amount ? 1 : 0);
  return items
    .filter((i) => takes(i, kind))
    .map((item) => ({ item, amount: sameAmount(item), names: shared(item), days: daysApart(item.boughtOn, lone.boughtOn) }))
    .sort((a, b) => b.amount - a.amount || b.names - a.names || a.days - b.days)
    .map((x) => x.item);
}

/**
 * Why this lone row cannot join this receipt, or null when it may. The same
 * rules `joinTargets` offers by, checked again by the command on what the
 * database holds now, because a page can be stale.
 */
export function joinRefusal(input: {
  lone: { amount: number; documents: JoinDocument[] };
  receipt: { currency: string; amount: number; removed: boolean; documents: JoinDocument[] };
}): string | null {
  const { lone, receipt } = input;
  const kind = loneKind(lone.documents);
  if (!kind) return "That row is not a bank deduction or a red invoice on its own.";
  if (kind === "bank_deduction" && !(lone.amount > 0)) return "The bank deduction has no amount yet. Edit it and enter what the bank took.";
  if (receipt.removed) return "That receipt was removed from the claim.";
  if (loneKind(receipt.documents) !== null) return "Pick a receipt, not another document on its own.";
  if (kind === "bank_deduction") {
    if (receipt.currency.toLowerCase() === "vnd") return "A bank deduction joins a receipt paid in another currency.";
    if (current(receipt.documents).some((d) => d.kind === kind)) return "That receipt already has its bank deduction.";
    // The value keeps the rate the bank's figure implies (claim-rules itemValue), which needs the receipt's own amount.
    if (!(receipt.amount > 0)) return "That receipt has no amount yet. Edit it and enter the amount on the receipt first.";
    return null;
  }
  if (receipt.currency.toLowerCase() !== "vnd") return "A red invoice joins a receipt bought in Vietnam, in dong.";
  if (current(receipt.documents).some((d) => d.kind === kind)) return "That receipt already has its red invoice.";
  return null;
}
