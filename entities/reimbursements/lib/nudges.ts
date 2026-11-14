// The Monday nudges (plan section 9, design §1.8; RB.8): at 08:00 Vietnam time
// every Monday, whoever has claims waiting on them is told how many, with a
// link to their queue. Checkers hear about submitted claims, approvers about
// checked ones. Nobody hears about a week with nothing waiting.
//
// The recipients are whoever holds the permission through a grant
// (`peopleHolding`), never a name in code. A person's own claim never waits on
// them (design §1.5), so it is left out of their count unless they may decide
// their own (the Employer, §1.6). Each link leads to a page the recipient may
// open, on the surface they work in, or there is no email at all. Each email
// is keyed by the day, the queue and the person, so a retried run sends once.
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { EMAIL_SIGN_OFF } from "@/kernel/config/contacts";
import { escapeHtml } from "@/kernel/config/html";
import { GREETING_COLUMNS, greetingName, type GreetedPerson } from "@/kernel/config/people-name";
import { PALETTE } from "@/kernel/config/palette";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { accessOf } from "@/kernel/identity/access-of-person";
import { mayOpen } from "@/kernel/identity/may-open";
import { peopleHolding } from "@/kernel/identity/people-holding";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { selectReimbursementClaims } from "./reads";

/** One queue a nudge is about: who holds it, which claims wait in it, and where it opens. */
type Queue = {
  key: "check" | "approve";
  permission: "reimbursements.check" | "reimbursements.approve";
  status: "submitted" | "checked";
  /** The queue's pages, Team first for the checker who has no Admin surface; the first the recipient may open is linked. */
  hrefs: string[];
  verb: string;
};

const QUEUES: Queue[] = [
  { key: "check", permission: "reimbursements.check", status: "submitted", hrefs: ["/team/finance/claims/to-check", "/admin/finance/reimbursements/to-check"], verb: "to check" },
  { key: "approve", permission: "reimbursements.approve", status: "checked", hrefs: ["/admin/finance/reimbursements/to-approve"], verb: "to approve" },
];

/** How many of `claims` wait on `personId`: their own are left out unless they may decide their own. Pure. */
export function waitingOn(claims: { personId: string }[], personId: string, mayDecideOwn: boolean): number {
  return claims.filter((c) => mayDecideOwn || c.personId !== personId).length;
}

/**
 * `skipped` is a queue nobody holds, a gap in who has the permission. `failed`
 * is a nudge that should have gone and did not, as "person: why" lines the cron
 * reports as failures (Y.23).
 */
export type NudgeReport = { check: number; approve: number; skipped: string[]; failed: string[] };

/** Sends this Monday's nudges; `today` keys them, so a rerun the same day sends nothing twice. */
export async function sendMondayNudges(today: string): Promise<NudgeReport> {
  const report: NudgeReport = { check: 0, approve: 0, skipped: [], failed: [] };
  const origin = await getSiteOrigin();
  for (const q of QUEUES) {
    // A must-read: a failed read raises, so the run is an error someone sees, never a quiet week.
    const claims = mustRows(await selectReimbursementClaims("id, person_id").eq("status", q.status), `[reimbursements] claims ${q.verb}`).map((c) => ({
      personId: String(c.person_id),
    }));
    if (claims.length === 0) continue;
    const holders = await peopleHolding(q.permission);
    if (holders.length === 0) {
      report.skipped.push(`${q.key}: nobody holds ${q.permission}`);
      continue;
    }
    const people = mustRows(await companyOs.from("people").select(`id, ${GREETING_COLUMNS}`).in("id", holders), "[reimbursements] who to nudge") as unknown as (GreetedPerson & {
      id: string;
      email: string | null;
    })[];
    for (const id of holders) {
      const person = people.find((p) => p.id === id);
      if (!person?.email) continue;
      const access = await accessOf(id);
      const count = waitingOn(claims, id, access?.may("reimbursements.decide-own") ?? false);
      if (count === 0) continue;
      const path = q.hrefs.find((href) => mayOpen(access, href));
      if (!path) continue;
      const url = `${origin}${path}`;
      const what = `${count} ${count === 1 ? "claim waits" : "claims wait"} ${q.verb}`;
      const html = `
    <p>Hi ${escapeHtml(greetingName(person, "there"))},</p>
    <p>${escapeHtml(what)}.</p>
    <p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Open the queue</a></p>
    <p style="font-size:13px;color:${PALETTE.greyMid};">Or copy this link: ${url}</p>
    ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
  `.trim();
      const sent = await sendTransactionalEmail({
        to: person.email,
        subject: `Reimbursements: ${what}`,
        html,
        logMeta: { nudge: q.key, count },
        idempotencyKey: `reimbursements-nudge:${today}:${q.key}:${id}`,
      });
      if (sent) report[q.key] += 1;
      else report.failed.push(`${greetingName(person, "someone")}: the ${q.key} nudge email was not sent`);
    }
  }
  return report;
}
