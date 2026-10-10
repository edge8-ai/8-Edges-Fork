// What this entity tells people about their claims (design §1.8), one function
// per fact, called after a move has landed. RB.3 brought the owner's email when
// a claim is sent back or rejected, at its check or its approval, with the
// reason and a link to the claim; RB.4 the approvers' email when a claim is
// checked and waits for them; RB.6 the run-built notices to accounting@ and
// the Operations chat; RB.8 the submission's; RB.7 the person's Paid and
// returned emails and accounting@'s when a whole run is paid. accounting@
// (ACCOUNTING_EMAIL) is a channel, not a person, and no channel message ever
// carries a bank detail or a person's amount.
//
// A link is sent only to someone whose access reaches its page (ADR 0013,
// `recipientMayOpen`), and every email is keyed by the history row that caused
// it, so a retried action never sends twice. Nothing here throws: the claim has
// already moved, and a failed email is logged rather than answered as a failed
// decision the checker would retry into a refusal.
import { companyOs } from "@/kernel/data/supabase";
import { accountingEmail, EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { notifyOps } from "@/kernel/messaging/lark";
import { escapeHtml } from "@/kernel/config/html";
import { GREETING_COLUMNS, greetingName, NAME_ONLY_COLUMNS, personName, type GreetedPerson } from "@/kernel/config/people-name";
import { PALETTE } from "@/kernel/config/palette";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { accessOf } from "@/kernel/identity/access-of-person";
import { mayOpen, recipientMayOpen } from "@/kernel/identity/may-open";
import { peopleHolding } from "@/kernel/identity/people-holding";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import type { DecisionStep } from "./claim-rules";
import { adminRunPath, teamRunPath } from "./paths";

export type OwnerDecision = {
  claimId: string;
  ownerPersonId: string;
  title: string;
  became: "sent_back" | "rejected";
  /** Where the claim was decided: at its check or at its approval (`decidingStep`). */
  step: DecisionStep;
  reason: string;
  /** The history row the decision left; null when it could not be written, and the email then goes unkeyed. */
  eventId: string | null;
};

// Who decided, by the step they decide at rather than by a team or a person:
// the checker may be Finance or the employer, and nobody's name belongs in
// shipped code. Their name is on the claim's history, which the link opens.
const DECIDER: Record<DecisionStep, string> = { check: "the checker", approval: "the approver" };

function copyFor(d: OwnerDecision): { subject: string; lead: string; next: string } {
  const by = DECIDER[d.step];
  return d.became === "sent_back"
    ? { subject: "Sent back", lead: `was sent back to you by ${by}`, next: "Open the claim, fix what is asked, and resubmit it." }
    : {
        subject: "Rejected",
        lead: `was rejected by ${by}`,
        next: `This is final: the claim will not be paid. If you think this is a mistake, talk to ${by}; the claim's history says who it was.`,
      };
}

export async function tellOwnerOfDecision(d: OwnerDecision): Promise<void> {
  try {
    const { data: person, error } = await companyOs.from("people").select(`email, ${GREETING_COLUMNS}`).eq("id", d.ownerPersonId).maybeSingle();
    if (error) throw new Error(error.message);
    const email = (person as { email?: string | null } | null)?.email;
    if (!email) return;
    const path = `/team/claims/${d.claimId}`;
    if (!(await recipientMayOpen(d.ownerPersonId))(path)) return;
    const url = `${await getSiteOrigin()}${path}`;
    const copy = copyFor(d);
    const html = `
    <p>Hi ${escapeHtml(greetingName(person as GreetedPerson, "there"))},</p>
    <p>Your claim <strong>${escapeHtml(d.title)}</strong> ${copy.lead}:</p>
    <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${PALETTE.line};color:${PALETTE.inkBody};">${escapeHtml(d.reason).replace(/\n/g, "<br>")}</blockquote>
    <p>${copy.next}</p>
    <p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Open the claim</a></p>
    <p style="font-size:13px;color:${PALETTE.greyMid};">Or copy this link: ${url}</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
    await sendTransactionalEmail({
      to: email,
      subject: `${copy.subject}: ${d.title}`,
      html,
      logMeta: { claimId: d.claimId, became: d.became },
      ...(d.eventId ? { idempotencyKey: `claim:${d.claimId}:${d.eventId}` } : {}),
    });
  } catch (err) {
    console.error("[reimbursements] the owner was not emailed about a decision", d.claimId, d.became, err instanceof Error ? err.message : err);
  }
}

export type ClaimChecked = {
  claimId: string;
  ownerPersonId: string;
  title: string;
  /** Who checked it: never told, since they know. */
  checkedBy: string | null;
  /** The check's history row; null when it could not be written, and the emails then go unkeyed. */
  eventId: string | null;
};

type Recipient = { id: string; email: string | null } & GreetedPerson;

/**
 * Tells the approvers that a checked claim waits for them (design §1.8: "Checked
 * → approver holders: email + Waiting on you"). The approvers are whoever holds
 * reimbursements.approve through a grant (`peopleHolding`), never a name in
 * code. The checker is left out, and so is the claim's owner unless they may
 * decide their own claim (the Employer, §1.6), because nobody else can approve
 * it for them. Each link stays inside Admin, where the approver works: the
 * claim's page when the recipient may open it, else the To approve list, else
 * no email at all. No email carries an Approve button; the decision is made
 * on the page after signing in.
 */
export async function tellApproversOfCheck(c: ClaimChecked): Promise<void> {
  try {
    const holders = (await peopleHolding("reimbursements.approve")).filter((id) => id !== c.checkedBy);
    if (holders.length === 0) return;
    const { data, error } = await companyOs
      .from("people")
      .select(`id, ${GREETING_COLUMNS}`)
      .in("id", [...new Set([...holders, c.ownerPersonId])]);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Recipient[];
    const owner = personName(rows.find((r) => r.id === c.ownerPersonId) ?? null, "Someone");
    const origin = await getSiteOrigin();
    for (const id of holders) {
      const person = rows.find((r) => r.id === id);
      if (!person?.email) continue;
      const access = await accessOf(id);
      if (id === c.ownerPersonId && !access?.may("reimbursements.decide-own")) continue;
      const path = [`/admin/finance/reimbursements/${c.claimId}`, "/admin/finance/reimbursements/to-approve"].find((href) => mayOpen(access, href));
      if (!path) continue;
      const url = `${origin}${path}`;
      const html = `
    <p>Hi ${escapeHtml(greetingName(person, "there"))},</p>
    <p>${escapeHtml(owner)}'s claim <strong>${escapeHtml(c.title)}</strong> has been checked and is waiting for your approval.</p>
    <p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Open the claim</a></p>
    <p style="font-size:13px;color:${PALETTE.greyMid};">Or copy this link: ${url}</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
      await sendTransactionalEmail({
        to: person.email,
        subject: `To approve: ${c.title}`,
        html,
        logMeta: { claimId: c.claimId, became: "checked" },
        // One key per recipient: a key shared by two addresses would send to the first only.
        ...(c.eventId ? { idempotencyKey: `claim:${c.claimId}:${c.eventId}:${id}` } : {}),
      });
    }
  } catch (err) {
    console.error("[reimbursements] the approvers were not emailed about a checked claim", c.claimId, err instanceof Error ? err.message : err);
  }
}

function linkButton(url: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">${escapeHtml(label)}</a></p>
    <p style="font-size:13px;color:${PALETTE.greyMid};">Or copy this link: ${url}</p>`;
}

/**
 * One email to the bookkeeper's mailbox (accounting@), a channel rather than a
 * person: it is not filtered by `mayOpen`, and what it carries is a link the
 * page behind it guards. Skipped with a log line while ACCOUNTING_EMAIL is
 * unset (no fallback: a hardcoded address is how a fork mails its upstream).
 */
async function tellAccounting(m: { subject: string; paragraphs: string[]; url: string; label: string; idempotencyKey: string; logMeta: Record<string, unknown> }): Promise<void> {
  const to = accountingEmail();
  if (!to) {
    console.warn("[reimbursements] ACCOUNTING_EMAIL is not set; accounting@ was not told", m.logMeta);
    return;
  }
  const html = `
    ${m.paragraphs.map((p) => `<p>${p}</p>`).join("\n    ")}
    ${linkButton(m.url, m.label)}
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  await sendTransactionalEmail({ to, subject: m.subject, html, logMeta: m.logMeta, idempotencyKey: m.idempotencyKey });
}

export type ClaimSubmitted = {
  claimId: string;
  ownerPersonId: string;
  title: string;
  /** How many receipts it carries; null when they could not be counted, and the line then leaves the count out. */
  receipts: number | null;
  resubmitted: boolean;
  /** The submit's history row; null when it could not be written, and the email then goes unkeyed by it. */
  eventId: string | null;
};

/**
 * A claim was submitted (plan section 9, design §1.8; RB.8): one line in the
 * Operations chat and one email to accounting@, each naming who submitted
 * what with a link to it, and never an amount or a bank detail. The chat's
 * link opens the claim in Admin, where the Operations chat's readers work;
 * accounting@'s opens the checker's page on the Team view.
 */
export async function tellOfSubmission(s: ClaimSubmitted): Promise<void> {
  try {
    const { data: person, error } = await companyOs.from("people").select(NAME_ONLY_COLUMNS).eq("id", s.ownerPersonId).maybeSingle();
    if (error) throw new Error(error.message);
    const who = personName((person ?? null) as Parameters<typeof personName>[0], "Someone");
    const verb = s.resubmitted ? "resubmitted" : "submitted";
    const count = s.receipts === null ? "" : `, ${s.receipts} ${s.receipts === 1 ? "receipt" : "receipts"}`;
    const origin = await getSiteOrigin();
    await notifyOps(`${who} ${verb} a claim: ${s.title}${count}. ${origin}/admin/finance/reimbursements/${s.claimId}`);
    await tellAccounting({
      subject: `Claim ${verb}: ${s.title}`,
      paragraphs: ["Hi,", `${escapeHtml(who)} ${verb} a reimbursement claim: <strong>${escapeHtml(s.title)}</strong>${escapeHtml(count)}.`, "It waits to be checked."],
      url: `${origin}/team/finance/claims/${s.claimId}`,
      label: "Open the claim",
      idempotencyKey: `claim:${s.claimId}:${s.eventId ?? verb}:accounting`,
      logMeta: { claimId: s.claimId, fact: "submitted" },
    });
  } catch (err) {
    console.error("[reimbursements] the submission was not announced", s.claimId, err instanceof Error ? err.message : err);
  }
}

export type RunBuilt = { runId: string; runDate: string; people: number; claims: number; totalVnd: number };

/**
 * A run was built (design §1.8): accounting@ gets one email with the counts,
 * the total and a link, and the Operations chat one line with the people and
 * the total. Neither carries a bank detail or a per-person amount: those are
 * on the run's page, behind reimbursements.pay. Sent once per run; the caller
 * claims `notified_at` before calling.
 */
export async function tellOfRunBuilt(r: RunBuilt): Promise<void> {
  const when = formatDate(r.runDate);
  const people = `${r.people} ${r.people === 1 ? "person" : "people"}`;
  try {
    const origin = await getSiteOrigin();
    await tellAccounting({
      subject: `Payment run ${when}: ${people}, ${formatVndWhole(r.totalVnd)}`,
      paragraphs: [
        "Hi,",
        `The reimbursement payment run for <strong>${escapeHtml(when)}</strong> is ready: ${r.claims} ${r.claims === 1 ? "claim" : "claims"} for ${escapeHtml(people)}, ${escapeHtml(formatVndWhole(r.totalVnd))} in total.`,
        "Open it to see who to pay and their bank details, pay each person, then record each payment with its bank receipt.",
      ],
      url: `${origin}${teamRunPath(r.runId)}`,
      label: "Open the payment run",
      idempotencyKey: `payment-run:${r.runId}:built`,
      logMeta: { runId: r.runId, fact: "run_built" },
    });
    await notifyOps(`Payment run ${when}: ${people}, ${formatVndWhole(r.totalVnd)}. ${origin}${adminRunPath(r.runId)}`);
  } catch (err) {
    console.error("[reimbursements] the run's notices were not sent", r.runId, err instanceof Error ? err.message : err);
  }
}

/** One claim a payment covered, as an email lists it. */
type PaidClaimLine = { id: string; title: string };

/**
 * The person's own email about their payment: who it is for, the claims as
 * links to their pages (each only if their access opens it), and the lead.
 * Nothing in it is a bank detail; the receipt itself stays on the claim.
 */
async function tellPayee(m: {
  personId: string;
  claims: PaidClaimLine[];
  subject: string;
  lead: (claims: string) => string;
  after: string;
  idempotencyKey: string;
  logMeta: Record<string, unknown>;
}): Promise<void> {
  const { data: person, error } = await companyOs.from("people").select(GREETING_COLUMNS).eq("id", m.personId).maybeSingle();
  if (error) throw new Error(error.message);
  const email = (person as { email?: string | null } | null)?.email;
  if (!email || m.claims.length === 0) return;
  const may = await recipientMayOpen(m.personId);
  const origin = await getSiteOrigin();
  const opens = m.claims.filter((c) => may(`/team/claims/${c.id}`));
  if (opens.length === 0) return;
  const list = opens.map((c) => `<a href="${origin}/team/claims/${c.id}">${escapeHtml(c.title)}</a>`).join(", ");
  const html = `
    <p>Hi ${escapeHtml(greetingName(person as GreetedPerson, "there"))},</p>
    <p>${m.lead(list)}</p>
    <p>${m.after}</p>
    ${linkButton(`${origin}/team/claims/${opens[0].id}`, opens.length === 1 ? "Open the claim" : "Open the first claim")}
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
  await sendTransactionalEmail({ to: email, subject: m.subject, html, logMeta: m.logMeta, idempotencyKey: m.idempotencyKey });
}

/**
 * Paid (decision 7): the person is told how much was sent for which claims,
 * with links to the claims, where the bank's receipt downloads. The receipt
 * is never attached: it carries their account number.
 */
export async function tellOwnerOfPayment(p: { paymentId: string; personId: string; paidVnd: number; claims: PaidClaimLine[] }): Promise<void> {
  try {
    await tellPayee({
      personId: p.personId,
      claims: p.claims,
      subject: `Paid: ${formatVndWhole(p.paidVnd)}`,
      lead: (list) => `${escapeHtml(formatVndWhole(p.paidVnd))} was sent to your bank account for ${list}.`,
      after: "The bank's receipt is on the claim: open it there to download it.",
      idempotencyKey: `payment:${p.paymentId}:paid`,
      logMeta: { paymentId: p.paymentId, fact: "paid" },
    });
  } catch (err) {
    console.error("[reimbursements] the person was not emailed about their payment", p.paymentId, err instanceof Error ? err.message : err);
  }
}

/**
 * A transfer that failed (decision 5): the person is told why, that their
 * claims wait for the next run, and to check the bank details on the claim.
 */
export async function tellOwnerOfReturn(p: { paymentId: string; personId: string; reason: string; claims: PaidClaimLine[] }): Promise<void> {
  try {
    await tellPayee({
      personId: p.personId,
      claims: p.claims,
      subject: "Your reimbursement could not be paid",
      lead: (list) => `The bank transfer for ${list} did not go through: ${escapeHtml(p.reason)}`,
      after: "Please check the bank details on the claim. The claims stay approved and are paid in the next run.",
      idempotencyKey: `payment:${p.paymentId}:returned`,
      logMeta: { paymentId: p.paymentId, fact: "returned" },
    });
  } catch (err) {
    console.error("[reimbursements] the person was not emailed about a returned payment", p.paymentId, err instanceof Error ? err.message : err);
  }
}

/** The whole run is paid (RB.7): one email to accounting@ with the people, the total sent and a link. */
export async function tellAccountingOfRunPaid(r: { runId: string; runDate: string; people: number; totalVnd: number }): Promise<void> {
  const when = formatDate(r.runDate);
  const people = `${r.people} ${r.people === 1 ? "person" : "people"}`;
  try {
    const origin = await getSiteOrigin();
    await tellAccounting({
      subject: `Payment run ${when} is paid: ${people}, ${formatVndWhole(r.totalVnd)}`,
      paragraphs: [
        "Hi,",
        `Every payment in the reimbursement run for <strong>${escapeHtml(when)}</strong> is recorded: ${escapeHtml(people)}, ${escapeHtml(formatVndWhole(r.totalVnd))} sent.`,
        "The bank receipts are on the run's page and in the month-end export.",
      ],
      url: `${origin}${teamRunPath(r.runId)}`,
      label: "Open the payment run",
      idempotencyKey: `payment-run:${r.runId}:paid`,
      logMeta: { runId: r.runId, fact: "run_paid" },
    });
  } catch (err) {
    console.error("[reimbursements] accounting@ was not told the run is paid", r.runId, err instanceof Error ? err.message : err);
  }
}
