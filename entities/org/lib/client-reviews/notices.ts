import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";
import { shortDay } from "@/kernel/config/dates";
import { greetingName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

// The emails a client review sends, all of them to team members (CR.1.2,
// CR.1.4). Nothing in this file may address a client contact: a client
// manager and a skip-manager are never mailed by the app, so every recipient
// here is read from team_members and nowhere else. The never-contact tests
// hold that line.

type MemberRow = { id: string; people: (NamedPerson & { email: string | null }) | (NamedPerson & { email: string | null })[] | null };

async function membersToMail(teamMemberIds: readonly string[]): Promise<Array<{ id: string; email: string; greeting: string | null }>> {
  const ids = [...new Set(teamMemberIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const rows = mustRows(
    await companyOs.from("team_members").select(`id, people!person_id(email, ${NAME_COLUMNS})`).in("id", ids),
    "[org/client-reviews] members to email",
  ) as unknown as MemberRow[];
  return rows.flatMap((r) => {
    const person = one(r.people);
    if (!person?.email) return [];
    return [{ id: r.id, email: person.email, greeting: greetingName(person, null) }];
  });
}

/**
 * What a round of emails came to. `addressed` is how many of the members had
 * an address and so were sent one; null when the addresses could not be read.
 * `sent` below `addressed` means sends were tried and failed, while `addressed`
 * of 0 means there was nobody to send to, which no retry changes.
 */
export type MailOutcome = { sent: number; addressed: number | null };

async function mailEach(
  teamMemberIds: readonly string[],
  message: { subject: string; lead: string; kind: string },
): Promise<MailOutcome> {
  let sent = 0;
  let addressed: number | null = null;
  try {
    const members = await membersToMail(teamMemberIds);
    addressed = members.length;
    const link = `${await getSiteOrigin()}/team/reviews`;
    for (const m of members) {
      const ok = await sendTransactionalEmail({
        to: m.email,
        subject: message.subject,
        html:
          `<p>Hi${m.greeting ? ` ${escapeHtml(m.greeting)}` : ""},</p>` +
          `<p>${message.lead}</p>` +
          `<p><a href="${link}">Open your reviews</a></p>` +
          (EMAIL_SIGN_OFF ? `<p>Thank you,<br/>${EMAIL_SIGN_OFF}</p>` : `<p>Thank you.</p>`),
        logMeta: { source: "client-reviews", kind: message.kind, teamMemberId: m.id },
      });
      if (ok) sent++;
    }
  } catch (err) {
    // An email is how a member hears of their part, not what the part is, so
    // a failure is logged and the caller goes on. The Inbox still holds the ask.
    console.error("[org/client-reviews] emails not sent:", err instanceof Error ? err.message : err);
  }
  return { sent, addressed };
}

/** The cycle as the members' email names it. */
type MemberEmailCycle = { clientName: string | null; cycleName: string; dueDate: string | null };

// The words of the email that tells the members their review is open (CR.5.4).
// The app's email and the message the owner copies to email them by hand say
// the same thing, so a member reads one message whichever way it reached them.
function memberEmailCopy(cycle: MemberEmailCycle): { subject: string; lead: string } {
  const title = cycle.clientName ? `${cycle.clientName} · ${cycle.cycleName}` : cycle.cycleName;
  return {
    subject: cycle.clientName ? `Your ${cycle.clientName} review is open` : "Your performance review is open",
    lead: `Your performance review for ${title} is open. Please fill in your self-assessment in the team app${cycle.dueDate ? ` by ${shortDay(cycle.dueDate)}` : ""}`,
  };
}

/** The message the owner copies to send the members themselves: the app's email, as plain text to every member at once. */
export function memberEmailMessage(cycle: MemberEmailCycle, origin: string): string {
  const { subject, lead } = memberEmailCopy(cycle);
  return `Subject: ${subject}\n\nHi all,\n\n${lead}:\n${origin}/team/reviews\n\nThank you.`;
}

/** Tells each member their review for this cycle is open and waiting for their part (CR.5.4). Says how many emails went, of how many members with an address. */
export function emailMembersTheirClientReviewIsOpen(teamMemberIds: readonly string[], cycle: MemberEmailCycle): Promise<MailOutcome> {
  const { subject, lead } = memberEmailCopy(cycle);
  return mailEach(teamMemberIds, { subject, lead: `${escapeHtml(lead)}.`, kind: "client_review_open" });
}

/**
 * Reminds each member their self-assessment is still waiting, ahead of the
 * cycle's due date (CR.5.5). Says how many emails went, of how many members with an address.
 */
export function emailMembersTheirReviewIsWaiting(teamMemberIds: readonly string[], cycle: MemberEmailCycle & { dueDate: string }): Promise<MailOutcome> {
  const title = cycle.clientName ? `${cycle.clientName} · ${cycle.cycleName}` : cycle.cycleName;
  const due = shortDay(cycle.dueDate);
  return mailEach(teamMemberIds, {
    subject: cycle.clientName ? `Reminder: your ${cycle.clientName} review is due ${due}` : `Reminder: your performance review is due ${due}`,
    lead: escapeHtml(`Your self-assessment for ${title} is still waiting. Please send it in the team app by ${due}.`),
    kind: "client_review_reminder",
  });
}
