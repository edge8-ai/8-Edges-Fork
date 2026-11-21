// What this entity tells people about an advance (AD.4, design section 8), one
// function per fact, called after a move has landed. Each email is keyed by the
// history row that caused it, so a retried action never sends twice. A link goes only
// to someone whose access reaches its page (ADR 0013), and no notice carries a bank
// detail. Nothing here throws: the money has already moved, and a failed email is
// logged rather than answered as a failed move someone would retry into a refusal.
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";
import { GREETING_COLUMNS, greetingName, type GreetedPerson } from "@/kernel/config/people-name";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { companyOs } from "@/kernel/data/supabase";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { advanceRef } from "./advance-rules";
import { nextRunDate } from "./claim-rules";
import { linkButton, ownerName, reachableHolders } from "./notices";
import { advanceDecisionPath, financeAdvancePath, ownAdvancePath } from "./paths";

/** What every notice is about. */
type AdvanceAbout = { advanceId: string; refNo: number; ownerPersonId: string; purpose: string; amountVnd: number; eventId: string | null };

const key = (a: AdvanceAbout, to: string) => (a.eventId ? { idempotencyKey: `advance:${a.advanceId}:${a.eventId}:${to}` } : {});

function page(name: GreetedPerson, paragraphs: string[], url: string, label: string): string {
  return `
    <p>Hi ${escapeHtml(greetingName(name, "there"))},</p>
    ${paragraphs.map((p) => `<p>${p}</p>`).join("\n    ")}
    ${linkButton(url, label)}
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
}

/** Whether the owner was told. Most callers go on either way, because a failed email must not undo a move; the reminders report it. */
async function tellOwner(a: AdvanceAbout, subject: string, paragraphs: string[], label: string): Promise<boolean> {
  try {
    const { data: person, error } = await companyOs.from("people").select(`email, ${GREETING_COLUMNS}`).eq("id", a.ownerPersonId).maybeSingle();
    if (error) throw new Error(error.message);
    const email = (person as { email?: string | null } | null)?.email;
    if (!email) return false;
    const path = ownAdvancePath(a.advanceId);
    if (!(await recipientMayOpen(a.ownerPersonId))(path)) return false;
    return await sendTransactionalEmail({
      to: email,
      subject: `${subject}: ${a.purpose}`,
      html: page(person as GreetedPerson, paragraphs, `${await getSiteOrigin()}${path}`, label),
      logMeta: { advanceId: a.advanceId },
      ...key(a, a.ownerPersonId),
    });
  } catch (err) {
    console.error("[reimbursements] the owner was not emailed about an advance", a.advanceId, subject, err instanceof Error ? err.message : err);
    return false;
  }
}

async function tellHolders(a: AdvanceAbout, permission: string, leaveOut: string[], subject: (owner: string) => string, paragraphs: (owner: string) => string[], path = financeAdvancePath(a.advanceId)): Promise<boolean> {
  try {
    const owner = await ownerName(a.ownerPersonId);
    const holders = await reachableHolders(permission, { about: a.advanceId, leaveOut, paths: [path] });
    // Nobody to reach is nobody told.
    let told = holders.length > 0;
    for (const { person, email, url } of holders) {
      const sent = await sendTransactionalEmail({
        to: email,
        subject: subject(owner),
        html: page(person, paragraphs(owner), url, "Open the advance"),
        logMeta: { advanceId: a.advanceId },
        // One key per recipient: a key shared by two addresses would send to the first only.
        ...key(a, person.id),
      });
      if (!sent) told = false;
    }
    return told;
  } catch (err) {
    console.error("[reimbursements] holders were not emailed about an advance", a.advanceId, permission, err instanceof Error ? err.message : err);
    return false;
  }
}

const amount = (a: AdvanceAbout) => formatVndWhole(a.amountVnd);
const named = (a: AdvanceAbout) => `<strong>${escapeHtml(a.purpose)}</strong> (${advanceRef(a.refNo)})`;

/** A request waits for the approvers. The owner is left out: they cannot approve their own unless they may, which the page says. */
export async function tellApproversOfRequest(a: AdvanceAbout): Promise<void> {
  await tellHolders(a, "reimbursements.approve", [a.ownerPersonId], (owner) => `Advance to approve: ${owner}, ${amount(a)}`, (owner) => [
    `${escapeHtml(owner)} asks for an advance of <strong>${amount(a)}</strong> for ${named(a)}.`,
    "Check the amount against the quote, then approve it, send it back or reject it.",
  ], advanceDecisionPath(a.advanceId));
}

/** The approver's word, with the reason when it is a no. */
export async function tellOwnerOfDecision(a: AdvanceAbout & { became: "approved" | "sent_back" | "rejected"; reason: string | null }): Promise<void> {
  if (a.became === "approved") {
    await tellOwner(a, "Advance approved", [`Your advance of <strong>${amount(a)}</strong> for ${named(a)} is approved. Finance sends it by bank transfer next.`], "See your advance");
    return;
  }
  const why = `<blockquote>${escapeHtml(a.reason ?? "")}</blockquote>`;
  if (a.became === "sent_back") {
    await tellOwner(a, "Advance sent back", [`Your advance for ${named(a)} was sent back:`, why, "Change what it asks for and send it again."], "Fix your advance");
    return;
  }
  await tellOwner(a, "Advance rejected", [`Your advance for ${named(a)} was rejected:`, why], "See your advance");
}

/** One to transfer. Whoever approved it is left out, because they may not record its transfer. */
export async function tellPayersToTransfer(a: AdvanceAbout & { approvedBy: string | null }): Promise<void> {
  await tellHolders(a, "reimbursements.pay", [a.ownerPersonId, ...(a.approvedBy ? [a.approvedBy] : [])], (owner) => `To transfer: ${owner}, ${amount(a)}`, (owner) => [
    `${escapeHtml(owner)}'s advance of <strong>${amount(a)}</strong> for ${named(a)} is approved. It doesn't wait for a payment run, so please transfer it today and record it with the bank's receipt.`,
  ]);
}

/** Finance says the money had already gone when the owner cancelled, so it is back on. Only the owner can see whether it arrived. */
export async function tellOwnerOfReinstate(a: AdvanceAbout & { reason: string }): Promise<void> {
  await tellOwner(a, "Your advance is back on", [
    `Finance says <strong>${amount(a)}</strong> for ${named(a)} had already gone when you cancelled:`,
    `<blockquote>${escapeHtml(a.reason)}</blockquote>`,
    "Settle it as usual once they have recorded the transfer. If the money never reached you, cancel it again and say so.",
  ], "See your advance");
}

/** Whoever was told not to send it hears that it is back on, so nobody sends it again. */
export async function tellPayersOfReinstate(a: AdvanceAbout & { reason: string; putBackBy: string | null }): Promise<void> {
  await tellHolders(a, "reimbursements.pay", [a.ownerPersonId, ...(a.putBackBy ? [a.putBackBy] : [])], (owner) => `Don't send again: ${owner}, ${advanceRef(a.refNo)}`, (owner) => [
    `${escapeHtml(owner)} cancelled the advance of <strong>${amount(a)}</strong> for ${named(a)}, but the money had already gone, so it is back on. Please don't send it again. The transfer still has to be recorded:`,
    `<blockquote>${escapeHtml(a.reason)}</blockquote>`,
  ]);
}

/** Cancelled before the transfer, so nobody sends it. */
export async function tellPayersOfCancel(a: AdvanceAbout & { reason: string }): Promise<void> {
  await tellHolders(a, "reimbursements.pay", [], (owner) => `Don't transfer: ${owner} cancelled ${advanceRef(a.refNo)}`, (owner) => [
    `${escapeHtml(owner)} cancelled the advance of <strong>${amount(a)}</strong> for ${named(a)} before it was sent, so please don't transfer it:`,
    `<blockquote>${escapeHtml(a.reason)}</blockquote>`,
  ]);
}

/** The money is sent, and the clock starts. */
export async function tellOwnerOfPayout(a: AdvanceAbout & { settleBy: string }): Promise<void> {
  await tellOwner(a, "Advance sent", [
    `<strong>${amount(a)}</strong> for ${named(a)} is on its way to your account.`,
    `Keep every red invoice, and settle by <strong>${formatDate(a.settleBy)}</strong>.`,
  ], "See your advance");
}

/** How a settlement ended: square, the company owing them, or them owing the company. */
export async function tellOwnerOfClose(a: AdvanceAbout & { balanceVnd: number }): Promise<void> {
  if (a.balanceVnd > 0) {
    await tellOwner(a, "Advance settled", [
      `Your settlement for ${named(a)} is approved. The company owes you <strong>${formatVndWhole(a.balanceVnd)}</strong>, paid in the run on ${formatDate(nextRunDate(new Date().toISOString()))}.`,
    ], "See your advance");
    return;
  }
  if (a.balanceVnd < 0) {
    await tellOwner(a, "Return the rest of your advance", [
      `Your settlement for ${named(a)} is approved. Please return <strong>${formatVndWhole(-a.balanceVnd)}</strong> by bank transfer, with the reference <strong>${advanceRef(a.refNo)} HOAN UNG</strong>.`,
      "The advance page says where to send it.",
    ], "See your advance");
    return;
  }
  await tellOwner(a, "Advance settled", [`Your settlement for ${named(a)} is approved. It matches what was advanced, so nothing moves either way.`], "See your advance");
}

/** Three working days before the date, to whoever holds the money. */
export async function tellOwnerOfDeadline(a: AdvanceAbout & { settleBy: string; owedVnd?: number | null }): Promise<boolean> {
  if (a.owedVnd) return tellOwner(a, "Return your advance soon", [`Please return <strong>${formatVndWhole(a.owedVnd)}</strong> on ${named(a)} by <strong>${formatDate(a.settleBy)}</strong>. The advance page says where to send it.`], "See your advance");
  return tellOwner(a, "Settle your advance soon", [`Please settle <strong>${amount(a)}</strong> for ${named(a)} by <strong>${formatDate(a.settleBy)}</strong>, with your red invoices, and return what you did not spend.`], "Settle your advance");
}

/** Once the date has passed, once: to whoever holds the money, and to Finance. */
export async function tellOfOverdue(a: AdvanceAbout & { settleBy: string; owedVnd?: number | null }): Promise<boolean> {
  // Money owed back is what is late then, not the whole advance, and there is nothing left to settle.
  const late = a.owedVnd ? formatVndWhole(a.owedVnd) : amount(a);
  const owner = a.owedVnd
    ? await tellOwner(a, "Your advance is past its date", [`<strong>${late}</strong> on ${named(a)} was due back by <strong>${formatDate(a.settleBy)}</strong>. Please return it now.`], "See your advance")
    : await tellOwner(a, "Your advance is past its date", [`<strong>${late}</strong> for ${named(a)} was due to be settled by <strong>${formatDate(a.settleBy)}</strong>. Please settle it now.`], "Settle your advance");
  const finance = await tellHolders(a, "reimbursements.pay", [a.ownerPersonId], (owner) => `Overdue advance: ${owner}, ${late}`, (owner) => [`${escapeHtml(owner)}'s advance of <strong>${late}</strong> for ${named(a)} was due by <strong>${formatDate(a.settleBy)}</strong>. They have been told.`]);
  return owner && finance;
}

/** Money is now owed back, by a settlement or by "I spent none of it", so Finance looks out for it. */
export async function tellPayersOfMoneyOwed(a: AdvanceAbout & { owedVnd: number }): Promise<void> {
  const owed = formatVndWhole(a.owedVnd);
  await tellHolders(a, "reimbursements.pay", [a.ownerPersonId], (owner) => `Coming back: ${owner}, ${owed}`, (owner) => [
    `${escapeHtml(owner)} owes <strong>${owed}</strong> back on ${named(a)}, with the reference <strong>${advanceRef(a.refNo)} HOAN UNG</strong>. Record each transfer when it arrives.`,
  ]);
}

/** The person says they sent the money back. A hint: the ledger moves on what the bank shows. */
export async function tellPayersOfReportedReturn(a: AdvanceAbout): Promise<void> {
  await tellHolders(a, "reimbursements.pay", [a.ownerPersonId], (owner) => `Money coming back: ${owner}, ${advanceRef(a.refNo)}`, (owner) => [
    `${escapeHtml(owner)} says money for ${named(a)} is on its way back. Record it when the bank shows it.`,
  ]);
}

/** A return arrived. */
export async function tellOwnerOfReturnConfirmed(a: AdvanceAbout & { outstandingAfterVnd: number }): Promise<void> {
  const paragraph =
    a.outstandingAfterVnd > 0
      ? `Finance recorded your return on ${named(a)}. <strong>${formatVndWhole(a.outstandingAfterVnd)}</strong> is still owed.`
      : `Finance recorded your return on ${named(a)}. Nothing more is owed, and the advance is settled.`;
  await tellOwner(a, a.outstandingAfterVnd > 0 ? "Return recorded" : "Advance settled", [paragraph], "See your advance");
}
