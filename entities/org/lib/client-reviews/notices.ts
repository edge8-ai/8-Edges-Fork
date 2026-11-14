import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";
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

async function mailEach(
  teamMemberIds: readonly string[],
  message: { subject: string; lead: string; kind: string },
): Promise<number> {
  let sent = 0;
  try {
    const members = await membersToMail(teamMemberIds);
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
  return sent;
}

/** Tells each member their self-assessment is open. Returns how many emails went. */
export function emailMembersTheirReviewIsOpen(teamMemberIds: readonly string[]): Promise<number> {
  return mailEach(teamMemberIds, {
    subject: "Your performance review is open",
    lead:
      "Your performance review for the past six months is open. Please fill in your self-assessment. Your manager reads it once you submit, and you cannot change your answers after that.",
    kind: "client_review_open",
  });
}

/** Reminds each member their self-assessment is still waiting (CR.1.4). Returns how many emails went. */
export function emailMembersTheirReviewIsWaiting(teamMemberIds: readonly string[]): Promise<number> {
  return mailEach(teamMemberIds, {
    subject: "Reminder: your performance review is waiting",
    lead: "Your self-assessment for this review is still waiting. Your manager starts their part once you submit yours.",
    kind: "client_review_reminder",
  });
}
