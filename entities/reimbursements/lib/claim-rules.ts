// The rules of a claim, pure: which status a move leads to and who may make it
// (design §1.2), what the owner may do in each state, what must be true before
// a claim can be submitted, and the line the owner reads about where it is.
//
// Pure on purpose, as time-off's transitions.ts is: these rules are what every
// surface asks, so they live in one table a test can walk end to end, and the
// claim form's disabled Submit and the submit action ask the same function.
// Authorization is not here. The caller has proved who it is; this answers
// "may this status become that one for this kind of actor", never "is this
// caller allowed to ask" (ADR 0007).
//
// Client-safe: no import reaches the server.
import { businessDate, diffDays } from "@/kernel/config/dates";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { minorDigits, vndAt } from "./currencies";
import { documentOptional } from "./categories";
import type { OwnerRemoval } from "./retention-rules";

export const CLAIM_STATUSES = ["draft", "submitted", "checked", "sent_back", "rejected", "approved", "in_run", "paid"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  checked: "Checked",
  sent_back: "Sent back",
  rejected: "Rejected",
  approved: "Approved",
  in_run: "In payment run",
  paid: "Paid",
};

export const CLAIM_STATUS_TONE: Record<ClaimStatus, "ok" | "warn" | "err" | "info" | "neutral"> = {
  draft: "neutral",
  submitted: "info",
  checked: "info",
  sent_back: "warn",
  rejected: "err",
  approved: "ok",
  in_run: "ok",
  paid: "ok",
};

export function isClaimStatus(value: string): value is ClaimStatus {
  return (CLAIM_STATUSES as readonly string[]).includes(value);
}

/** Every way a claim can move. Deleting a draft is not a move: the claim stops existing. */
export const CLAIM_MOVES = ["submit", "withdraw", "check", "send_back", "reject", "approve", "enter_run", "pay", "return_to_approved"] as const;
export type ClaimMove = (typeof CLAIM_MOVES)[number];

/**
 * The moves each decider makes from their page, as the decision actions'
 * input schema reads them: anything else is "Unknown move." before a read.
 * Written out for the type the pages hand the actions; the test pins each list
 * to the arrows below, so a new arrow cannot be missing here.
 */
export const DECIDER_MOVES = {
  checker: ["check", "send_back", "reject"],
  approver: ["approve", "send_back", "reject"],
} as const satisfies Record<"checker" | "approver", readonly ClaimMove[]>;

/**
 * Whose rules apply. Not a permission — the caller has already proved it holds
 * one — but the part the actor plays: the owner (submit, withdraw, resubmit),
 * a checker, the approver, the payer, and the payment run's cron.
 */
export type ClaimActorKind = "owner" | "checker" | "approver" | "payer" | "cron";

export type ClaimTransition =
  | { outcome: "apply"; status: ClaimStatus }
  | { outcome: "noop" }
  | { outcome: "refuse"; error: string };

/** One arrow of the diagram: from these statuses, by this actor, to that one. */
type Arrow = { from: readonly ClaimStatus[]; actor: ClaimActorKind; to: ClaimStatus };

// The plan's diagram (section 3) plus the one arrow the plan's decisions added (§4.5): a payer
// returns a claim whose transfer failed to approved, for the next run. Send
// back and reject have two arrows each because the checker and the approver
// both decide, each at their own step.
const ARROWS: Record<ClaimMove, readonly Arrow[]> = {
  submit: [{ from: ["draft", "sent_back"], actor: "owner", to: "submitted" }],
  withdraw: [{ from: ["submitted"], actor: "owner", to: "draft" }],
  check: [{ from: ["submitted"], actor: "checker", to: "checked" }],
  send_back: [
    { from: ["submitted"], actor: "checker", to: "sent_back" },
    { from: ["checked"], actor: "approver", to: "sent_back" },
  ],
  reject: [
    { from: ["submitted"], actor: "checker", to: "rejected" },
    { from: ["checked"], actor: "approver", to: "rejected" },
  ],
  approve: [{ from: ["checked"], actor: "approver", to: "approved" }],
  enter_run: [{ from: ["approved"], actor: "cron", to: "in_run" }],
  pay: [{ from: ["in_run"], actor: "payer", to: "paid" }],
  return_to_approved: [{ from: ["in_run"], actor: "payer", to: "approved" }],
};

/** The moves that need a reason (design §2.3): the reason is what the owner reads. */
export const REASONED: ReadonlySet<ClaimMove> = new Set<ClaimMove>(["send_back", "reject", "return_to_approved"]);

/**
 * The moves a repeat answers ok without writing: the owner's (a second click,
 * two tabs) and the run's cron (a rerun). Every other move is somebody's
 * decision, and a repeat of it is refused (RB.1's rule, "repeated decisions
 * refuse"): a second checker racing the first must hear that the claim was
 * already checked, not that theirs was recorded when nothing was recorded
 * under their name. A send back, a rejection or a return also carries a
 * reason the claim already shows was someone else's.
 */
const IDEMPOTENT: ReadonlySet<ClaimMove> = new Set<ClaimMove>(["submit", "withdraw", "enter_run"]);

// Who may make each move, for the refusal a wrong actor hears.
const WHO: Record<ClaimMove, string> = {
  submit: "Only the claim's owner can submit it.",
  withdraw: "Only the claim's owner can withdraw it.",
  check: "Only a checker can check a claim.",
  send_back: "Only a checker or the approver can send a claim back.",
  reject: "Only a checker or the approver can reject a claim.",
  approve: "Only the approver can approve a claim.",
  enter_run: "Only the payment run puts a claim in a run.",
  pay: "Only the payer can record a claim as paid.",
  return_to_approved: "Only the payer can return a claim to approved.",
};

// Why a right actor still cannot make the move from where the claim is.
function stuck(from: ClaimStatus, move: ClaimMove): string {
  if (move === "withdraw") {
    return from === "sent_back" || from === "rejected"
      ? "This claim is no longer waiting to be checked, so there is nothing to withdraw."
      : `This claim has been ${CLAIM_STATUS_LABEL[from].toLowerCase()}, so it can no longer be withdrawn.`;
  }
  if (move === "submit") return `This claim is ${CLAIM_STATUS_LABEL[from].toLowerCase()}, so it cannot be submitted again.`;
  return `A ${CLAIM_STATUS_LABEL[from].toLowerCase()} claim cannot be moved this way.`;
}

export function nextClaimStatus(from: ClaimStatus, move: ClaimMove, actor: ClaimActorKind): ClaimTransition {
  const arrows = ARROWS[move];
  const mine = arrows.filter((a) => a.actor === actor);
  if (mine.length === 0) return { outcome: "refuse", error: WHO[move] };
  const arrow = mine.find((a) => a.from.includes(from));
  if (arrow) return { outcome: "apply", status: arrow.to };
  // Already where this actor's move leads: a second click, or two tabs. Only
  // an idempotent move answers ok; a decision says it was already made.
  if (mine.some((a) => a.to === from)) {
    return IDEMPOTENT.has(move) ? { outcome: "noop" } : { outcome: "refuse", error: `This claim is already ${CLAIM_STATUS_LABEL[from].toLowerCase()}.` };
  }
  return { outcome: "refuse", error: stuck(from, move) };
}

/** The two steps a claim is decided at: the check (Finance's), then the approval (RB.4). */
export type DecisionStep = "check" | "approval";

/**
 * The step a send back or a rejection is made at, read from the status the
 * claim leaves: a submitted claim is at its check, a checked one at its
 * approval. The approvals row it settles and what the owner is told both come
 * from here, so the email cannot name one step while the record names another.
 */
export function decidingStep(from: ClaimStatus): DecisionStep {
  return from === "checked" ? "approval" : "check";
}

/** The statuses a claim is its owner's to change in: a draft, or one sent back to fix. */
export const OWNER_OPEN: readonly ClaimStatus[] = ["draft", "sent_back"];

/**
 * What the owner may do with their claim in its current state (plan §3 and
 * §10). Edit and submit while it is theirs to fix (draft, or sent back);
 * withdraw while it waits to be checked; delete only a draft that was never
 * submitted, because a claim once submitted is kept for ten years — the
 * database refuses the delete for the same reason, reading `submitted_at`.
 * `remove` is how a receipt or a document comes off it (OwnerRemoval).
 */
export function ownerCan(claim: { status: ClaimStatus; submittedAt: string | null }): {
  edit: boolean;
  submit: boolean;
  withdraw: boolean;
  delete: boolean;
  remove: OwnerRemoval;
} {
  const open = OWNER_OPEN.includes(claim.status);
  const neverSubmitted = claim.status === "draft" && claim.submittedAt === null;
  return {
    edit: open,
    submit: open,
    withdraw: claim.status === "submitted",
    delete: neverSubmitted,
    remove: !open ? null : neverSubmitted ? "delete" : "mark",
  };
}

/** A rate as an item is stamped with it: VND per one unit, its source, and the day it is for. */
export type StampedRate = { rate: number; source: "techcombank" | "vietcombank" | "manual"; asOf: string };

/** The VND columns of an item, as they are stored. `amount_vnd` null is "rate pending". */
export type ItemValueColumns = {
  amount_vnd: number | null;
  fx_rate: number | null;
  fx_source: "none" | "techcombank" | "vietcombank" | "manual" | "card";
  fx_as_of: string | null;
  charged_vnd: number | null;
};

/**
 * An item's value in VND (plan section 10, design §1.10). A dong receipt is
 * itself, at a rate of 1. Anywhere else, what the person's card actually
 * charged wins whenever they enter it (its implied rate is kept so the
 * checker sees how far it is from the bank's); otherwise the bank's or a
 * checker's rate on the day; and with neither, no value: rate pending.
 * `amount` is in the currency's minor units.
 */
export function itemValue(input: { amount: number; currency: string; chargedVnd: number | null; rate: StampedRate | null }): ItemValueColumns {
  const { amount, currency, chargedVnd, rate } = input;
  if (currency.toLowerCase() === "vnd") return { amount_vnd: amount, fx_rate: 1, fx_source: "none", fx_as_of: null, charged_vnd: null };
  if (chargedVnd !== null && chargedVnd > 0 && amount > 0) {
    const implied = Math.round((chargedVnd / (amount / 10 ** minorDigits(currency))) * 1e6) / 1e6;
    return { amount_vnd: chargedVnd, fx_rate: implied, fx_source: "card", fx_as_of: null, charged_vnd: chargedVnd };
  }
  if (rate) return { amount_vnd: vndAt(amount, currency, rate.rate), fx_rate: rate.rate, fx_source: rate.source, fx_as_of: rate.asOf, charged_vnd: null };
  return { amount_vnd: null, fx_rate: null, fx_source: "none", fx_as_of: null, charged_vnd: null };
}

/**
 * How many receipts a decision would keep that have no VND value yet, their
 * rate pending (RB.10). While any has, the kept total leaves them out, so it
 * is not yet what the claim comes to. Pure.
 */
export function ratePendingOf(items: { amountVnd: number | null; declined: boolean }[]): number {
  return items.filter((i) => !i.declined && i.amountVnd === null).length;
}

/**
 * A claim whose every receipt is declined would be checked and approved at
 * 0 ₫, a payment nobody makes: that is a rejection, and the decider is told
 * so at the check and at the approval.
 */
export const ALL_DECLINED = "Every receipt is declined: reject the claim instead.";

/**
 * Why a claim cannot be checked yet, or null. A receipt whose rate is pending
 * has no VND value, and the check passes a total on to the approver, so every
 * receipt the check keeps needs one: a checker enters the rate by hand or
 * declines the receipt first. A declined receipt is not paid and needs none.
 */
export function checkRefusal(items: { label: string; amountVnd: number | null; declined: boolean }[]): string | null {
  if (items.length > 0 && items.every((i) => i.declined)) return ALL_DECLINED;
  const pending = items.filter((i) => !i.declined && i.amountVnd === null);
  if (pending.length === 0) return null;
  return pending.map((i) => `${i.label}: rate pending.`).join(" ") + " Enter the rate by hand, or decline the receipt, before checking.";
}

/**
 * Whether a new receipt starts as bought in Vietnam (design §1.1): a dong
 * receipt does, any other currency does not. Only the starting value; the
 * person can change it, and what they said is stored for the checker.
 */
export function boughtInVietnamByDefault(currency: string): boolean {
  return currency.toLowerCase() === "vnd";
}

/** How old a receipt may be before it carries the plan's gentle label. */
export const RECEIPT_AGE_LABEL_DAYS = 90;

/**
 * Whether a receipt was bought more than 90 days before `asOf` (a calendar
 * day: the day the claim was submitted, or today while it is the owner's).
 * The plan's rule is a label the owner and the checker see, never a refusal:
 * the submit rule does not read it, so an old receipt blocks nothing. A
 * receipt with no date says nothing.
 */
export function olderThan90Days(boughtOn: string | null, asOf: string): boolean {
  if (!boughtOn) return false;
  return diffDays(boughtOn, asOf) > RECEIPT_AGE_LABEL_DAYS;
}

/**
 * One stored document as the submit rule sees it: its kind, whether its upload
 * was confirmed, its type, and whether the owner set it aside for another
 * (`replaced_at`), after which it satisfies nothing.
 */
export type SubmitDocument = { kind: "receipt" | "red_invoice"; confirmed: boolean; mimeType: string | null; replaced: boolean };

/** One item as the submit rule sees it. `amount` is in the item's currency (whole dong for VND). A removed item needs nothing. */
export type SubmitItem = {
  label: string;
  category: string;
  currency: string;
  amount: number;
  boughtInVietnam: boolean;
  lostReceiptNote: string | null;
  removed: boolean;
  documents: SubmitDocument[];
};

/**
 * A red invoice the rule accepts: filed as one, its upload confirmed, and a
 * PDF. Confirm already refuses a red invoice whose bytes are not a PDF and
 * removes it; the type is asked again here so a row that reached the table any
 * other way still cannot stand in for one.
 */
const isRedInvoice = (d: SubmitDocument) => d.kind === "red_invoice" && d.confirmed && !d.replaced && d.mimeType === "application/pdf";
const isPhoto = (d: SubmitDocument) => d.confirmed && !d.replaced && !!d.mimeType?.startsWith("image/");

/**
 * Whether a claim can be submitted, and every reason it cannot yet, in the
 * order the form shows them. An unconfirmed upload is not a document: nobody
 * has looked at what arrived. Nor is a replaced one: the owner set it aside.
 * A removed item is asked nothing, and is not a receipt on the claim.
 *
 * An item bought in Vietnam is reimbursed against a red invoice and nothing
 * else (RB.2): a confirmed PDF filed as a red invoice, never a photo and never
 * a written explanation. This is a hard block on presence alone; whether the
 * invoice names the organisation as buyer is the AI reading's warning (RB.9),
 * which never blocks. An item bought abroad needs any confirmed document, or a
 * note saying why there is none. Transport needs neither (documentOptional).
 *
 * A claim is paid by transfer, so it is not submitted until its owner has a
 * bank's name and an account number on file (RB.5): a claim nobody could pay
 * would otherwise be checked, approved and put in a run, then stall there.
 */
export function canSubmit(claim: { title: string; items: SubmitItem[]; bankDetailsOnFile: boolean }): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const items = claim.items.filter((i) => !i.removed);
  if (!claim.title.trim()) reasons.push("Give the claim a title.");
  if (items.length === 0) reasons.push("Add at least one receipt.");
  for (const item of items) {
    if (!(item.amount > 0)) reasons.push(`${item.label} needs an amount.`);
    if (documentOptional(item.category)) continue;
    if (item.boughtInVietnam) {
      if (!item.documents.some(isRedInvoice)) {
        reasons.push(
          item.documents.some(isPhoto)
            ? `${item.label} was bought in Vietnam: a photo is a receipt, not a red invoice. Add the seller's e-invoice PDF.`
            : `${item.label} was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF.`,
        );
      }
      continue;
    }
    const documented = item.documents.some((d) => d.confirmed && !d.replaced);
    if (!documented && !item.lostReceiptNote?.trim()) reasons.push(`${item.label} has no receipt: add one, or write why.`);
  }
  if (!claim.bankDetailsOnFile) reasons.push("Add your bank details before submitting.");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * The run a claim approved at `approvedAt` is paid in: the first 1st or 15th
 * after the Vietnam date it was approved on. The run's cut-off is 00:00 Asia/
 * Ho_Chi_Minh on its own date (design §1.7), so a claim approved on the 15th
 * itself waits for the next one.
 */
export function nextRunDate(approvedAt: string): string {
  const [y, m, d] = businessDate(approvedAt).split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d < 15) return `${y}-${pad(m)}-15`;
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
}

/** What the owner's status line reads from, as far as the claim has come. */
export type StatusFacts = {
  status: ClaimStatus;
  /** Who sent it back or rejected it, and why: the last decision's event. */
  decidedBy?: string | null;
  reason?: string | null;
  approvedTotalVnd?: number | null;
  approvedAt?: string | null;
  runDate?: string | null;
  paidVnd?: number | null;
  paidAt?: string | null;
};

/** The line the owner reads for each state (plan section 3). */
export function statusLine(c: StatusFacts): string {
  switch (c.status) {
    case "draft":
      return "Not sent yet.";
    case "submitted":
      return "Being checked by Finance / Accounting.";
    case "checked":
      return "Checked – waiting for approval.";
    case "sent_back":
      return c.decidedBy && c.reason ? `Sent back by ${c.decidedBy}: ${c.reason}` : "Sent back to you to fix and resubmit.";
    case "rejected":
      return c.decidedBy && c.reason ? `Rejected by ${c.decidedBy}: ${c.reason}` : "Rejected.";
    case "approved": {
      const run = c.runDate ?? (c.approvedAt ? nextRunDate(c.approvedAt) : null);
      return `Approved: ${formatVndWhole(c.approvedTotalVnd ?? null)}.${run ? ` Will be paid in the run on ${formatDate(run)}.` : ""}`;
    }
    case "in_run":
      return c.runDate ? `In the ${formatDate(c.runDate)} run – payment on its way.` : "In a payment run – payment on its way.";
    case "paid":
      return `Paid ${formatVndWhole(c.paidVnd ?? null)}${c.paidAt ? ` on ${formatDate(c.paidAt)}` : ""}.`;
  }
}
