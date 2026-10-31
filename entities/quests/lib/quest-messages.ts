// Quests' email and Lark DMs (QS.2; spec 2026-10-20, "Notifications: email,
// Lark and the inbox"): a summon reaches each person called by one email and
// one Lark DM, a head due within two hours reaches each person still out on it
// by a private email and a Lark DM. The inbox rows are the notifications
// entity's, which writes rows a person chooses to open and never pushes
// (its entity.test.ts), so the pushes live here, with the entity that owns the
// ask, and all go through kernel/messaging.
//
// They run as Quests' own subscribers to its facts (subscriptions.ts), not
// inline in the action or the routine, so a send that fails is logged,
// audited and recorded as a failed delivery by the bus and never reaches the
// person who summoned, turned in or the routine's other work (ADR 0003).
//
// Who may receive one, decided twice over so a slip in either cannot reach
// outside the staff (the PR #2120 lesson): an address comes only from
// currentTeamEmails, which knows the current team and nobody else, and a
// message goes only to someone who may open the Quests page it links to
// (ADR 0013).
//
// Each send is keyed so a fact stated twice sends once: the email by its
// Resend idempotency key, the DM by the effect ledger (once). A send that
// fails is counted, the rest still go, and the handler then raises.
//
// The two-hour reminder is private to its recipient (ADR 0020): that it was
// sent says the person was still out on a head shortly before it closed, which
// is who is about to miss. So it leaves no row on the CRM timeline
// (company_os.interactions, which the CRM person page reads): its email and DM
// pass crmLog: false. Its failure, which the bus stores in
// event_deliveries.error and audits, names the head and a count, never a
// person; who it failed for goes to the console only. Its key, the same one
// for the email and the DM, names the head and a hash of the person id rather
// than the id: the key reaches Resend as the Idempotency-Key header, the effect
// ledger (company_os.automation_effects) and, on a 409, the audit line of an
// unconfirmed email, and none of those should name the person on sight. The
// hash is not a secret (anyone holding the people table can match it), so the
// key is still ADR 0020 territory: the ledger is read only by Settings ->
// Agents, which is an admin's (company-os.agents), the assistant's
// query_database refuses it and audit_log alike, and no other surface may read
// these keys. A summon is logged as any message is: being called on
// a Bounty is not private. Khoa confirmed on 2026-10-28 that the reminder
// stays off the CRM timeline, which is a client's contact history, not a place
// for staff reminders. On the same day he dropped the Giver's daily nudge as
// overkill (QS.2b), so a Giver hears of a Turn-in only on the Quests page.
import { createHash } from "node:crypto";
import { once, type OnceResult } from "@/kernel/audit/effects";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { EventPayload } from "@/kernel/events";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { currentTeamEmails } from "@/kernel/identity/team-people";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { deliverLarkDm } from "@/kernel/messaging/lark-api";
import { calledMessage, dueSoonMessage, type QuestMessage } from "./message-words";

const TAG = "[quests/messages]";
const QUESTS_PATH = "/team/quests";
const NO_ORIGIN = "no site origin (NEXT_PUBLIC_SITE_URL), so no message could carry its link";

/** How many people are sent to at once: a summon to the whole team should not wait on one send per person in a row. */
const AT_ONCE = 8;

type Recipient = { personId: string; email: string };

/** Runs `work` over `items`, a few at a time, collecting what failed. */
async function inBatches<T>(items: readonly T[], work: (item: T) => Promise<string | null>): Promise<string[]> {
  const failed: string[] = [];
  for (let i = 0; i < items.length; i += AT_ONCE) {
    const results = await Promise.all(items.slice(i, i + AT_ONCE).map(work));
    failed.push(...results.filter((r): r is string => r !== null));
  }
  return failed;
}

/** The Quests page's address in a message, or null when this deployment cannot say its own origin. */
async function questsUrl(): Promise<string | null> {
  const origin = await getSiteOrigin();
  return origin ? `${origin}${QUESTS_PATH}` : null;
}

/** The current staff among `personIds` who may open the Quests page, with their address. */
async function staffWhoMayOpen(personIds: readonly string[]): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (const [personId, email] of await currentTeamEmails(personIds)) {
    if ((await recipientMayOpen(personId))(QUESTS_PATH)) out.push({ personId, email });
  }
  return out;
}

/**
 * One Lark DM, at most once for its key. A person who opted out of DMs is
 * declined before any Lark call, and that is their choice, so the effect is
 * settled as done; a DM Lark refused, or one with no Lark user to reach, is
 * settled as failed, which releases its key for a later try.
 */
function dm(to: Recipient, key: string, text: string, summary: string, crmLog: boolean): Promise<OnceResult> {
  return once(
    key,
    "lark",
    async () => {
      const sent = await deliverLarkDm(to.email, text, { category: "other", ...(crmLog ? {} : { crmLog: false }) });
      return sent.ok || sent.declined ? { ok: true } : { ok: false, error: sent.reason };
    },
    { summary },
  );
}

/**
 * One person's email and Lark DM. Null when the email went, or what failed.
 * Only the email counts here: it is the message of record, and the DM beside
 * it is a convenience whose failure the effect ledger keeps. A summon to the
 * whole team should not fail because one person has no Lark account.
 * `crmLog` false keeps both off the CRM timeline (the header says why).
 */
async function emailAndDm(to: Recipient, key: string, m: QuestMessage, kind: string, crmLog = true): Promise<string | null> {
  const [, mailed] = await Promise.all([
    dm(to, key, m.text, `Lark DM to a quest's party member: ${kind}`, crmLog),
    sendTransactionalEmail({
      to: to.email,
      subject: m.subject,
      html: m.html,
      logMeta: { source: "quests", kind },
      idempotencyKey: key,
      ...(crmLog ? {} : { crmLog: false }),
    }),
  ]);
  return mailed ? null : `email to person ${to.personId} not sent`;
}

/** The reminder's key: the head, and the person only as a hash, so the key does not name them on sight (the header says why). */
function dueSoonKey(headId: string, personId: string): string {
  return `quests:due-soon:${headId}:${createHash("sha256").update(personId).digest("hex").slice(0, 16)}`;
}

function raiseIf(fact: string, failed: readonly string[]): void {
  if (failed.length > 0) throw new Error(`${TAG} ${fact}: ${failed.length} send(s) failed; first: ${failed[0]}`);
}

/** A Bounty was summoned: each person called, but the Giver, gets one email and one Lark DM. */
export async function sendCalled(e: EventPayload<"quest.called">): Promise<void> {
  const url = await questsUrl();
  if (!url) return raiseIf("quest.called", [NO_ORIGIN]);
  const m = calledMessage(e, url);
  const people = await staffWhoMayOpen(e.personIds.filter((p) => p !== e.giverId));
  raiseIf("quest.called", await inBatches(people, (p) => emailAndDm(p, `quests:called:${e.questId}:${p.personId}`, m, "called")));
}

/**
 * A head is due within two hours: each person the clock claimed a reminder for
 * gets a private email and a Lark DM, neither on the CRM timeline. A failure
 * raises with the head and a count only, because the bus keeps the error where
 * the person's name has no place (the header says why); who it failed for is
 * logged to the console.
 */
export async function sendDueSoon(e: EventPayload<"quest.head.due_soon">): Promise<void> {
  const url = await questsUrl();
  if (!url) return raiseIf("quest.head.due_soon", [NO_ORIGIN]);
  const m = dueSoonMessage(e, url);
  const people = await staffWhoMayOpen(e.personIds);
  const failed = await inBatches(people, (p) => emailAndDm(p, dueSoonKey(e.headId, p.personId), m, "due-soon", false));
  if (failed.length === 0) return;
  for (const line of failed) console.error(`${TAG} quest.head.due_soon on head ${e.headId}: ${line}`);
  throw new Error(`${TAG} quest.head.due_soon: ${failed.length} of ${people.length} reminder(s) on head ${e.headId} not sent`);
}
