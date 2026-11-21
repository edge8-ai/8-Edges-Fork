// Quests' Lark messages about an ask (QS.2, moved onto the notification router
// by AK.5; spec 2026-11-16, "Notices go through the router"): an ask reaches
// each person it is made of by one Lark message, and a required ask still
// waiting on them the working day before it is due by one private reminder.
// There is no email. The Inbox rows are the notifications entity's, which
// writes rows a person chooses to open and never pushes (its entity.test.ts),
// so the pushes live here, with the entity that owns the ask.
//
// Both go through kernel/messaging's router as the one non-urgent `quests.ask`
// notice kind, so the working-hours rule is held in one place: an ask made
// after 18:00 Saigon or at a weekend waits in the queue until 09:00 on the
// next weekday (CLAUDE.md, "Working hours"). A reminder is never held: outside
// working hours it is not sent at all (sendDueSoon says why). Nothing about an
// ask is urgent. The router's Lark DM honours the person's Lark opt-out
// (people.lark_dm_opt_out), so the one existing switch governs both.
//
// They run as Quests' own subscribers to its facts (subscriptions.ts), not
// inline in the action or the routine, so a send that fails is logged,
// audited and recorded as a failed delivery by the bus and never reaches the
// person who asked, answered or the routine's other work (ADR 0003).
//
// Who may receive one, decided twice over so a slip in either cannot reach
// outside the staff (the PR #2120 lesson): an address comes only from
// currentTeamEmails, which knows the current team and nobody else, and a
// message goes only to someone who may open the Asks page it links to
// (ADR 0013).
//
// Each send is keyed so a fact stated twice sends once: the router claims the
// key in the effect ledger, and queues a held ask under it. A send that
// fails is counted, the rest still go, and the handler then raises.
//
// The reminder is private to its recipient (ADR 0020): that it was sent says
// the person was still out on an ask the day before it closed, which is who is
// about to miss. The `quests.ask` kind keeps every DM off the CRM timeline
// (company_os.interactions, which the CRM person page reads). The reminder's
// failure, which the bus stores in event_deliveries.error and audits, names
// the head and a count, never a person; who it failed for goes to the console
// only. A reminder is never held, so nothing about it reaches the router's
// queue (company_os.notification_queue). Its key names the head and a hash of
// the person id rather than the id: the key reaches the effect ledger
// (company_os.automation_effects), which should not name the person on sight. The hash is
// not a secret (anyone holding the people table can match it), so the key is
// still ADR 0020 territory: the ledger is read only by Settings -> Agents,
// which is an admin's (company-os.agents), the assistant's query_database
// refuses it and audit_log alike, and no other surface may read these keys.
// A summon is not private: being asked is not a secret. Khoa confirmed on
// 2026-10-28 that the reminder stays off the CRM timeline, which is a client's
// contact history, not a place for staff reminders. On the same day he dropped
// the asker's daily nudge as overkill (QS.2b), so an asker hears of an answer
// only on the Asks page.
import { createHash } from "node:crypto";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import type { EventPayload } from "@/kernel/events";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { currentTeamEmails } from "@/kernel/identity/team-people";
import { inQuietHours } from "@/kernel/messaging/business-hours";
import { notify } from "@/kernel/messaging/router";
import { ASKS_HREF } from "../ui/team-nav";
import { calledMessage, dueSoonMessage, type AskMessage } from "./message-words";

const TAG = "[quests/messages]";
const NO_ORIGIN = "no site origin (NEXT_PUBLIC_SITE_URL), so no message could carry its link";

/** How many people are sent to at once: an ask to the whole team should not wait on one send per person in a row. */
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

/** The Asks page's address in a message, or null when this deployment cannot say its own origin. */
async function asksUrl(): Promise<string | null> {
  const origin = await getSiteOrigin();
  return origin ? `${origin}${ASKS_HREF}` : null;
}

/** The current staff among `personIds` who may open the Asks page, with their address. */
async function staffWhoMayOpen(personIds: readonly string[]): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (const [personId, email] of await currentTeamEmails(personIds)) {
    if ((await recipientMayOpen(personId))(ASKS_HREF)) out.push({ personId, email });
  }
  return out;
}

/**
 * One Lark message through the router, at most once for its key. Null when it
 * went, was held for the morning, was a repeat, or was declined by a person
 * who opted out of Lark DMs (that is their choice, not a failure); otherwise
 * what failed.
 */
async function send(to: Recipient, key: string, m: AskMessage, now?: Date): Promise<string | null> {
  const result = await notify({ kind: "quests.ask", to: { person: to.email }, message: m.text, subject: m.subject, dedupeKey: key }, now);
  return result.status === "failed" ? `Lark message to person ${to.personId} not sent: ${result.error}` : null;
}

/** The reminder's key: the head, and the person only as a hash, so the key does not name them on sight (the header says why). */
function dueSoonKey(headId: string, personId: string): string {
  return `quests:due-soon:${headId}:${createHash("sha256").update(personId).digest("hex").slice(0, 16)}`;
}

function raiseIf(fact: string, failed: readonly string[]): void {
  if (failed.length > 0) throw new Error(`${TAG} ${fact}: ${failed.length} send(s) failed; first: ${failed[0]}`);
}

/** An ask was made: each person it is made of, but the asker, gets one Lark message, held to 09:00 outside working hours. */
export async function sendCalled(e: EventPayload<"quest.called">): Promise<void> {
  const url = await asksUrl();
  if (!url) return raiseIf("quest.called", [NO_ORIGIN]);
  const m = calledMessage(e, url);
  const people = await staffWhoMayOpen(e.personIds.filter((p) => p !== e.giverId));
  raiseIf("quest.called", await inBatches(people, (p) => send(p, `quests:called:${e.questId}:${p.personId}`, m)));
}

/**
 * A required ask is due after this working day: each person the clock claimed a reminder for gets one private Lark message.
 *
 * Outside working hours nothing is sent and nothing is stored (Khoa, 17
 * November 2026, from the boundary review on PR #2667). The router would hold
 * the reminder in company_os.notification_queue under the person's address
 * until 09:00, and that row would be a stored record of who was still out,
 * which ADR 0020 keeps from everyone but the person. The clock claims
 * reminders only in working hours, so this is reached at the 18:00 edge, or by
 * a replay if the bus ever gains one (it has none today). The clock has set
 * reminded_at before it announces, so a skipped reminder is never sent later:
 * the warning below is its only trace, and the ask still waits on the person's
 * Asks page and in the sidebar count. The router is handed the same instant,
 * so it cannot find the hour quiet after this check found it working.
 *
 * A failure raises with the head and a count only, because the bus keeps the
 * error where the person's name has no place (the header says why); who it
 * failed for is logged to the console.
 */
export async function sendDueSoon(e: EventPayload<"quest.head.due_soon">, now: Date = new Date()): Promise<void> {
  if (inQuietHours(now)) {
    console.warn(`${TAG} quest.head.due_soon on head ${e.headId}: outside working hours, so no reminder is sent or held`);
    return;
  }
  const url = await asksUrl();
  if (!url) return raiseIf("quest.head.due_soon", [NO_ORIGIN]);
  const m = dueSoonMessage(e, url);
  const people = await staffWhoMayOpen(e.personIds);
  const failed = await inBatches(people, (p) => send(p, dueSoonKey(e.headId, p.personId), m, now));
  if (failed.length === 0) return;
  for (const line of failed) console.error(`${TAG} quest.head.due_soon on head ${e.headId}: ${line}`);
  throw new Error(`${TAG} quest.head.due_soon: ${failed.length} of ${people.length} reminder(s) on head ${e.headId} not sent`);
}
