// What the owner reads about their advance (AD.5), worded in one place so My Claims
// and the advance's own page never say two things. The prototype's words, with the
// approver's name handed in: this entity ships to the public fork, so no name is
// written here.
//
// Client-safe: dates and figures only.
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { isOverdue, isSettling, type AdvanceStatus } from "./advance-rules";
import { approvedOnCheck } from "./approval-limit";
import { outstandingOf, payableOf } from "./settlement-rules";

/** An advance with everything a sentence about it needs. */
export type AdvanceFacts = {
  status: AdvanceStatus;
  amountVnd: number;
  settleBy: string | null;
  spentVnd: number | null;
  balanceVnd: number | null;
  returnedVnd: number;
  claimStatus: string | null;
  reason: string | null;
  returnReported: boolean;
  paidTo: string | null;
  paidOutOn: string | null;
  approver: string;
  /** Why Finance put it back after the owner cancelled, while it waits for that transfer to be recorded. */
  reinstatedWhy?: string | null;
};

/** What checking or approving a settlement will do, for the person about to, in the money's own terms. */
export function settlementHint(s: { spentVnd: number; advancedVnd: number; owner: string; atApproval: boolean }): string {
  const payable = payableOf(s.spentVnd, s.advancedVnd);
  const balance = s.spentVnd - s.advancedVnd;
  if (!s.atApproval && !approvedOnCheck(payable)) return `The company would owe ${formatVndWhole(payable)}, at or over the approval limit, so it waits for approval before the advance closes.`;
  if (balance > 0) return `Settles the advance. The claim freezes ${formatVndWhole(payable)} for the next run, never the whole ${formatVndWhole(s.spentVnd)}.`;
  if (balance < 0) return `Settles the advance. ${s.owner} is asked to return ${formatVndWhole(-balance)}.`;
  return "Settles the advance. Nothing moves.";
}

/** What is still owed back, or 0. */
export function owedOf(a: Pick<AdvanceFacts, "balanceVnd" | "returnedVnd">): number {
  return a.balanceVnd === null ? 0 : outstandingOf(a.balanceVnd, a.returnedVnd);
}

/** The big line and the line under it, on My Claims. */
export function heroOf(a: AdvanceFacts, today: string): { figure: string; line: string } {
  const amount = formatVndWhole(a.amountVnd);
  const to = a.paidTo ? ` to ${a.paidTo}` : "";
  switch (a.status) {
    case "draft":
      return { figure: amount, line: "Not sent yet." };
    case "submitted":
      return { figure: amount, line: `Waiting for ${a.approver} to check it against the quote. You'll hear in your Inbox.` };
    case "sent_back":
      return { figure: amount, line: `${a.approver} sent it back: ${a.reason ?? "see the advance."}` };
    case "rejected":
      return { figure: amount, line: `${a.approver} rejected it: ${a.reason ?? "see the advance."}` };
    case "cancelled":
      return { figure: amount, line: "You cancelled it before any money moved." };
    case "approved":
      if (a.reinstatedWhy) return { figure: amount, line: "Finance says the money had already gone when you cancelled." };
      return { figure: amount, line: `Approved by ${a.approver}. Finance is sending it${to} today.` };
    case "paid_out":
      if (isSettling({ status: a.status, claimStatus: a.claimStatus })) return { figure: amount, line: "Finance is checking your receipts." };
      if (isOverdue({ status: a.status, settleBy: a.settleBy, claimStatus: a.claimStatus }, today)) {
        return { figure: amount, line: "The settle-by date has passed. Settle it now: an unsettled advance can be taxed as your income." };
      }
      return { figure: amount, line: `Sent${to}${a.paidOutOn ? ` on ${formatDate(a.paidOutOn)}` : ""}. Keep every red invoice.` };
    case "to_return":
      return {
        figure: formatVndWhole(owedOf(a)),
        // What they said comes first: telling someone who has just sent it to return it is wrong, and the action is gone.
        line: a.returnReported
          ? "You said it's on its way. Finance confirms when it arrives."
          : isOverdue({ status: a.status, settleBy: a.settleBy, claimStatus: a.claimStatus }, today)
            ? "The settle-by date has passed. Return it now: an unsettled advance can be taxed as your income."
            : "Left over. Return it by transfer to the company's account.",
      };
    case "settled": {
      const payable = a.spentVnd === null ? 0 : payableOf(a.spentVnd, a.amountVnd);
      if (payable > 0 && a.claimStatus === "paid") return { figure: `${formatVndWhole(payable)} paid to you`, line: "Settled. The company paid you the difference." };
      if (payable > 0) return { figure: `${formatVndWhole(payable)} to you`, line: "Settled. The company pays you the difference in the next run." };
      return { figure: "Nothing owed", line: (a.balanceVnd ?? 0) < 0 ? "Settled. The money you returned arrived." : "Settled. You spent exactly what you were given." };
    }
  }
}

type AlertTone = "info" | "warn" | "err" | "ok";

/** The line at the top of the advance's page. */
export function alertOf(a: AdvanceFacts, today: string): { tone: AlertTone; head: string; body: string } {
  const amount = formatVndWhole(a.amountVnd);
  switch (a.status) {
    case "draft":
      return { tone: "info", head: "Draft.", body: "Only you can see it." };
    case "submitted":
      return { tone: "info", head: `Waiting for ${a.approver}.`, body: "They check the amount against your quote." };
    case "sent_back":
      return { tone: "warn", head: `Sent back by ${a.approver}:`, body: a.reason ?? "" };
    case "rejected":
      return { tone: "err", head: `Rejected by ${a.approver}:`, body: a.reason ?? "" };
    case "cancelled":
      return { tone: "info", head: "Cancelled.", body: "No money moved." };
    case "approved":
      if (a.reinstatedWhy) return { tone: "warn", head: "Your advance is back on.", body: `Finance says the money had already gone when you cancelled: "${a.reinstatedWhy}" Settle it as usual once they have recorded it. If it never reached you, cancel it again and say so.` };
      return { tone: "ok", head: "Approved.", body: `Finance is sending ${amount} today, without waiting for a payment run.` };
    case "paid_out":
      if (isSettling({ status: a.status, claimStatus: a.claimStatus })) return { tone: "info", head: "Settling.", body: "Finance is checking your receipts." };
      if (isOverdue({ status: a.status, settleBy: a.settleBy, claimStatus: a.claimStatus }, today)) {
        return { tone: "err", head: `Overdue since ${formatDate(a.settleBy)}.`, body: "Settle it now. Finance has been told." };
      }
      return { tone: "ok", head: `Sent to you${a.paidOutOn ? ` on ${formatDate(a.paidOutOn)}` : ""}.`, body: `Settle by ${formatDate(a.settleBy)} with the red invoices.` };
    case "to_return":
      if (!a.returnReported && isOverdue({ status: a.status, settleBy: a.settleBy, claimStatus: a.claimStatus }, today)) {
        return { tone: "err", head: `Overdue since ${formatDate(a.settleBy)}.`, body: `Return ${formatVndWhole(owedOf(a))} by transfer now.` };
      }
      return {
        tone: "warn",
        head: `Settled with ${formatVndWhole(a.spentVnd ?? 0)} of receipts.`,
        body: a.returnReported ? "You said the rest is on its way." : `Return ${formatVndWhole(owedOf(a))} by transfer.`,
      };
    case "settled": {
      const payable = a.spentVnd === null ? 0 : payableOf(a.spentVnd, a.amountVnd);
      if (payable > 0 && a.claimStatus === "paid") return { tone: "ok", head: "Settled.", body: `The company paid you ${formatVndWhole(payable)}.` };
      if (payable > 0) return { tone: "ok", head: "Settled.", body: `The company owes you ${formatVndWhole(payable)}: it is in the next payment run.` };
      return { tone: "ok", head: "Settled.", body: (a.balanceVnd ?? 0) < 0 ? `${formatVndWhole(-(a.balanceVnd ?? 0))} came back by transfer.` : "You spent exactly the advance." };
    }
  }
}

type AdvanceStage = { label: string; state: "done" | "current" | "stopped" | "todo"; sub: string };

/** What closed it left, for the last step. Spending more than was advanced leaves the company owing, paid by a run. */
function closedStage(a: AdvanceFacts): string {
  const payable = a.spentVnd === null ? 0 : payableOf(a.spentVnd, a.amountVnd);
  if (payable === 0) return "Nothing owed";
  return `${formatVndWhole(payable)} ${a.claimStatus === "paid" ? "paid to you" : "to you"}`;
}

/** The five steps, and where it stands on them. */
export function stagesOf(a: AdvanceFacts, reached: { askedOn: string | null; approvedBy: string | null; sentOn: string | null }): AdvanceStage[] {
  const at: Record<AdvanceStatus, number> = { draft: 0, submitted: 1, sent_back: 1, rejected: 1, cancelled: 2, approved: 2, paid_out: 3, to_return: 4, settled: 5 };
  const here = at[a.status];
  const stopped = a.status === "sent_back" || a.status === "rejected" || a.status === "cancelled";
  const settling = isSettling({ status: a.status, claimStatus: a.claimStatus });
  const steps: [string, string][] = [
    ["Asked", reached.askedOn ? formatDate(reached.askedOn) : "You"],
    ["Approved", reached.approvedBy ?? a.approver],
    ["Sent to you", reached.sentOn ? formatDate(reached.sentOn) : "Finance"],
    ["Settled", "Receipts checked"],
    ["Closed", closedStage(a)],
  ];
  return steps.map(([label, doneSub], i) => {
    if (stopped && i === here) {
      return { label, state: "stopped", sub: a.status === "cancelled" ? "Cancelled by you" : a.status === "rejected" ? `Rejected by ${a.approver}` : `Sent back by ${a.approver}` };
    }
    if (i < here) return { label, state: "done", sub: doneSub };
    if (i === here) return { label, state: "current", sub: i === 3 && settling ? "Being checked" : "Waiting" };
    return { label, state: "todo", sub: "Not yet" };
  });
}

/** The ring's colour and fill: empty as the deadline nears, red once it has passed. */
export function ringOf(daysLeft: number, overdue: boolean, totalDays: number): { degrees: number; tone: "accent" | "warn" | "err" } {
  if (overdue) return { degrees: 360, tone: "err" };
  const share = totalDays > 0 ? Math.min(1, daysLeft / totalDays) : 0;
  return { degrees: Math.round(share * 360), tone: daysLeft <= 3 ? "warn" : "accent" };
}
