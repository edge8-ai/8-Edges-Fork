// The advance's state machine (AD.3, design section 2), as one pure table: the
// only arrows there are, who may take them and what a request must hold first.
// advance-lifecycle is the only writer of the status, and asks here first. The
// database agrees from its side: a status can never disagree with the ledger.
//
// "Settling" and "overdue" are read here and never stored: storing them would be
// two writes that can disagree.
//
// Authorization is not here (ADR 0007): the caller has proved who may ask.
// Client-safe: no import reaches the server.
import { ADVANCE_MAX_VND } from "./advance-policy";

export const ADVANCE_STATUSES = ["draft", "submitted", "sent_back", "rejected", "cancelled", "approved", "paid_out", "to_return", "settled"] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  sent_back: "Sent back",
  rejected: "Rejected",
  cancelled: "Cancelled",
  approved: "Approved · being sent",
  paid_out: "Money with you",
  to_return: "Return the rest",
  settled: "Settled",
};

/** An `approved` advance Finance put back: the money has gone, so "being sent" would invite a second transfer. */
export const PUT_BACK_LABEL = "Back on · record it";

/** The same statuses for someone other than the person holding the money: "money with you" is only true of them. */
export const ADVANCE_STATUS_LABEL_TO_OTHERS: Record<AdvanceStatus, string> = {
  ...ADVANCE_STATUS_LABEL,
  paid_out: "Money with them",
  to_return: "Returning the rest",
};

export const ADVANCE_STATUS_TONE: Record<AdvanceStatus, "ok" | "warn" | "err" | "info" | "neutral"> = {
  draft: "neutral",
  submitted: "info",
  sent_back: "warn",
  rejected: "err",
  cancelled: "neutral",
  approved: "ok",
  paid_out: "ok",
  to_return: "warn",
  settled: "ok",
};

/** The statuses an advance ends at. It leaves the person's card there, so a list has to lead back to its reason and its papers. */
export const CLOSED_ADVANCE_STATUSES: readonly AdvanceStatus[] = ["rejected", "cancelled", "settled"];

/** The statuses that hold a person's one open advance. The database's partial unique index lists the same ones. */
export const OPEN_ADVANCE_STATUSES: readonly AdvanceStatus[] = ["draft", "submitted", "sent_back", "approved", "paid_out", "to_return"];

export function isAdvanceStatus(value: string): value is AdvanceStatus {
  return (ADVANCE_STATUSES as readonly string[]).includes(value);
}

/** Every way an advance can move. Deleting a never-submitted draft is not a move: the advance stops existing. */
export const ADVANCE_MOVES = ["submit", "withdraw", "cancel", "approve", "send_back", "reject", "pay_out", "close", "return_unspent", "confirm_return", "reinstate"] as const;
export type AdvanceMove = (typeof ADVANCE_MOVES)[number];

/** The part an actor plays. `system` is the settlement claim's approval closing the advance. */
export type AdvanceActorKind = "owner" | "approver" | "payer" | "system";

type AdvanceTransition = { outcome: "apply"; status: AdvanceStatus } | { outcome: "noop" } | { outcome: "refuse"; error: string };

/**
 * What the two moves with more than one ending need to know. A close ends on the
 * balance and a confirmed return on what is still owed, and both are refused
 * without the figure, rather than guessed.
 */
type AdvanceFigures = { balanceVnd?: number; outstandingAfterVnd?: number };

type Arrow = { from: readonly AdvanceStatus[]; actor: AdvanceActorKind; to: readonly AdvanceStatus[] };

const ARROWS: Record<AdvanceMove, Arrow> = {
  submit: { from: ["draft", "sent_back"], actor: "owner", to: ["submitted"] },
  withdraw: { from: ["submitted"], actor: "owner", to: ["draft"] },
  cancel: { from: ["draft", "approved"], actor: "owner", to: ["cancelled"] },
  approve: { from: ["submitted"], actor: "approver", to: ["approved"] },
  send_back: { from: ["submitted"], actor: "approver", to: ["sent_back"] },
  reject: { from: ["submitted"], actor: "approver", to: ["rejected"] },
  pay_out: { from: ["approved"], actor: "payer", to: ["paid_out"] },
  close: { from: ["paid_out"], actor: "system", to: ["to_return", "settled"] },
  return_unspent: { from: ["paid_out"], actor: "owner", to: ["to_return"] },
  confirm_return: { from: ["to_return"], actor: "payer", to: ["to_return", "settled"] },
  reinstate: { from: ["cancelled"], actor: "payer", to: ["approved"] },
};

// An owner's second click answers ok without writing. A decision or a transfer
// says it was already made, because a second one is never what somebody meant.
const IDEMPOTENT: ReadonlySet<AdvanceMove> = new Set<AdvanceMove>(["submit", "withdraw", "cancel", "return_unspent"]);

const WHO: Record<AdvanceMove, string> = {
  submit: "Only the person asking can send an advance for approval.",
  withdraw: "Only the person asking can withdraw an advance.",
  cancel: "Only the person asking can cancel an advance.",
  approve: "Only an approver can approve an advance.",
  send_back: "Only an approver can send an advance back.",
  reject: "Only an approver can reject an advance.",
  pay_out: "Only Finance can record the transfer.",
  close: "An advance closes when its settlement is approved.",
  return_unspent: "Only the person holding the money can return it unspent.",
  confirm_return: "Only Finance can record money coming back.",
  reinstate: "Only Finance can put an advance back.",
};

/** The status in the words of whoever may make this move. */
const wordFor = (from: AdvanceStatus, move: AdvanceMove) => (ARROWS[move].actor === "owner" ? ADVANCE_STATUS_LABEL : ADVANCE_STATUS_LABEL_TO_OTHERS)[from].toLowerCase();

function stuck(from: AdvanceStatus, move: AdvanceMove): string {
  const standing = wordFor(from, move);
  if (move === "cancel") return `This advance is "${standing}", so it can no longer be cancelled.`;
  if (move === "withdraw") return `This advance is "${standing}", so there is nothing to withdraw.`;
  return `An advance that is "${standing}" cannot be moved this way.`;
}

function ending(move: AdvanceMove, figures: AdvanceFigures): AdvanceStatus | null {
  if (move === "close") {
    if (figures.balanceVnd === undefined) return null;
    return figures.balanceVnd < 0 ? "to_return" : "settled";
  }
  if (move === "confirm_return") {
    if (figures.outstandingAfterVnd === undefined) return null;
    return figures.outstandingAfterVnd > 0 ? "to_return" : "settled";
  }
  return ARROWS[move].to[0];
}

export function nextAdvanceStatus(from: AdvanceStatus, move: AdvanceMove, actor: AdvanceActorKind, figures: AdvanceFigures = {}): AdvanceTransition {
  const arrow = ARROWS[move];
  if (arrow.actor !== actor) return { outcome: "refuse", error: WHO[move] };
  if (arrow.from.includes(from)) {
    const to = ending(move, figures);
    return to ? { outcome: "apply", status: to } : { outcome: "refuse", error: "The figures this move ends on are missing." };
  }
  if (arrow.to.includes(from)) {
    return IDEMPOTENT.has(move) ? { outcome: "noop" } : { outcome: "refuse", error: `This advance is already "${wordFor(from, move)}".` };
  }
  return { outcome: "refuse", error: stuck(from, move) };
}

/** The moves that need a reason, because they tell someone no or take money back off the table. */
export function moveNeedsReason(move: AdvanceMove, from: AdvanceStatus): boolean {
  if (move === "send_back" || move === "reject" || move === "reinstate") return true;
  return move === "cancel" && from === "approved";
}

/** What an approver hears on their own advance. */
const OWN_ADVANCE = "You cannot decide your own advance.";

/**
 * Why this actor may not act on this advance as its owner or decider, or null when
 * they may. An advance that is not yours reads as not found. An approver decides
 * their own only with `decide-own`.
 */
export function ownAdvanceRefusal(advance: { personId: string }, actor: { kind: AdvanceActorKind; personId: string | null; mayDecideOwn: boolean }): string | null {
  const own = actor.personId !== null && actor.personId === advance.personId;
  if (actor.kind === "owner") return own ? null : "Advance not found.";
  if (actor.kind === "approver" && own && !actor.mayDecideOwn) return OWN_ADVANCE;
  return null;
}

/** Nobody records money moving on their own advance: the ledger is what says it was paid and paid back. Null when they may. */
export function ownMoneyRefusal(advance: { personId: string }, payer: { personId: string | null }): string | null {
  return advance.personId === payer.personId ? "This is your own advance, so someone else in Finance records its transfers." : null;
}

/** Four eyes on the money (Q2): whoever approved an advance does not record its transfer. Null when they may. */
export function payOutRefusal(advance: { decidedBy: string | null; personId: string }, payer: { personId: string | null }): string | null {
  if (payer.personId === null) return "Sign in as a person to record a transfer.";
  const own = ownMoneyRefusal(advance, payer);
  if (own) return own;
  return advance.decidedBy === payer.personId ? "You approved this advance, so someone else records its transfer." : null;
}

/**
 * Whether the person's "I have sent it" still stands. It is about the money owed when they said
 * it, so a transfer recorded since answers it, and what is left needs saying again.
 */
export function returnStillReported(metadata: unknown, returnedVnd: number): boolean {
  const m = (metadata ?? {}) as { returnReportedAt?: unknown; returnReportedAtVnd?: unknown };
  if (!m.returnReportedAt) return false;
  return (typeof m.returnReportedAtVnd === "number" ? m.returnReportedAtVnd : 0) === returnedVnd;
}

/** A draft that was never submitted is deleted, not cancelled: nothing has been asked, so nothing needs keeping. */
export function canDeleteAdvance(advance: { status: AdvanceStatus; submittedAt: string | null }): boolean {
  return advance.status === "draft" && advance.submittedAt === null;
}

/** The owner's choices on their advance, for the page to draw. */
export function ownerCanAdvance(advance: { status: AdvanceStatus; submittedAt: string | null; settling: boolean }): {
  edit: boolean;
  submit: boolean;
  withdraw: boolean;
  cancel: boolean;
  delete: boolean;
  settle: boolean;
  returnUnspent: boolean;
} {
  const { status, submittedAt, settling } = advance;
  const deletable = canDeleteAdvance({ status, submittedAt });
  return {
    edit: status === "draft" || status === "sent_back",
    submit: status === "draft" || status === "sent_back",
    withdraw: status === "submitted",
    cancel: status === "approved" || (status === "draft" && !deletable),
    delete: deletable,
    settle: status === "paid_out" && !settling,
    returnUnspent: status === "paid_out" && !settling,
  };
}

/**
 * Whether the owner may send it for approval, in words they can act on. The bank
 * details are checked here because an advance nobody can pay would be approved and
 * then stall. The one-open rule is here too, so the person hears why before the
 * database's unique index refuses.
 */
export function canSubmitAdvance(request: {
  purpose: string;
  amountVnd: number;
  spendEndsOn: string | null;
  evidenceCount: number;
  promised: boolean;
  bankDetailsOnFile: boolean;
  anotherOpen: boolean;
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!request.purpose.trim()) reasons.push("Say what it is for.");
  if (!Number.isSafeInteger(request.amountVnd) || request.amountVnd < 1) reasons.push("Give the amount.");
  else if (request.amountVnd > ADVANCE_MAX_VND) reasons.push(`At most ₫${ADVANCE_MAX_VND.toLocaleString("en-US")}. Ask for less, or split the purchase.`);
  if (!request.spendEndsOn) reasons.push("Give the purchase date, or the trip's last day.");
  if (request.evidenceCount < 1) reasons.push("Attach the quote, contract, booking or trip estimate.");
  if (!request.promised) reasons.push("Tick the promise to settle.");
  if (!request.bankDetailsOnFile) reasons.push("Add your bank details to your profile, so the money has somewhere to go.");
  if (request.anotherOpen) reasons.push("Settle your open advance first: one at a time.");
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** Waiting on its settlement to be checked. Never stored. */
export function isSettling(advance: { status: AdvanceStatus; claimStatus: string | null }): boolean {
  return advance.status === "paid_out" && (advance.claimStatus === "submitted" || advance.claimStatus === "checked");
}

/** Past its deadline with no settlement being checked, or with nothing spent and nothing yet returned. Never stored; `today` is a Vietnam business date. */
export function isOverdue(advance: { status: AdvanceStatus; settleBy: string | null; claimStatus: string | null }, today: string): boolean {
  // "I spent none of it" must not clear the flag with nothing returned, so money owed that way
  // stays overdue. A settlement that closed owing is not: they handed their receipts in, and how
  // long the review took is ours, so an on-time person is never told they are late for it.
  const held = advance.status === "paid_out" || (advance.status === "to_return" && advance.claimStatus === null);
  return held && advance.settleBy !== null && advance.settleBy < today && !isSettling(advance);
}

/** The reference a person writes on a transfer, and the number on the forms. */
export function advanceRef(refNo: number): string {
  return `ADV-${String(refNo).padStart(4, "0")}`;
}
