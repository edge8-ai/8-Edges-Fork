// What the team sidebar counts (TH.8, TH.11): the asks from teammates and the
// decisions that wait on the person, everything someone is waiting on. Read on
// every team page through the teamNavCounts shell slot, so every read here is
// tolerant: a failure hides the count rather than breaking the page or
// showing a wrong number.
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { getAccess } from "@/kernel/identity/access-request";
import { approvalsInbox } from "@/kernel/approvals/inbox";
import { ASK_KINDS } from "./kinds";
import { TEAM_INBOX_HREF } from "./inbox";

const ASK_SCAN = 200;

/**
 * How many asks from teammates wait on this person (TH.8): the count on the
 * team sidebar's Inbox row and the phone bar. An ask (ASK_KINDS) counts until
 * the person marks it done, read or not, which is when it leaves "From
 * teammates"; reminders and updates never count.
 *
 * It counts what the page would list, so the count never promises a row the
 * person cannot find: a row whose link they may no longer open is left out, as
 * inboxFor leaves it out. Most of the time nothing waits, and then the access
 * lookup is skipped.
 *
 * Every team page draws the sidebar, so a failure here must not break one: the
 * read is tolerant and its fallback is null, which draws no count.
 */
export async function askCount(personId: string): Promise<number | null> {
  const asks = readOr(
    await companyOs
      .from("notifications")
      .select("id, team_href")
      .eq("person_id", personId)
      .in("kind", [...ASK_KINDS])
      .order("created_at", { ascending: false })
      .limit(ASK_SCAN),
    "[notifications/ask-count] asks",
    null,
  );
  if (asks === null) return null;
  if (asks.length === 0) return 0;
  // Done, or snoozed until later (TH.8.3): neither is waiting now.
  const reads = readOr(
    await companyOs
      .from("notification_reads")
      .select("notification_id, done_at, snoozed_until")
      .in("notification_id", asks.map((a) => a.id))
      .or(`done_at.not.is.null,snoozed_until.gt.${new Date().toISOString()}`),
    "[notifications/ask-count] done or snoozed asks",
    null,
  );
  if (reads === null) return null;
  const settled = new Set(reads.map((d) => d.notification_id));
  const waiting = asks.filter((a) => !settled.has(a.id));
  if (waiting.length === 0) return 0;
  const mayOpen = await recipientMayOpen(personId).catch((err) => {
    console.error("[notifications/ask-count] access", err instanceof Error ? err.message : err);
    return null;
  });
  if (mayOpen === null) return null;
  return waiting.filter((a) => a.team_href === null || mayOpen(a.team_href)).length;
}

/**
 * How many decisions wait on this person (TH.11): what the team Inbox's
 * Decisions lists, read from the same approvals reader (named on them, on a
 * role they hold, and the admins' pool they can reach). The access is the one
 * the layout already resolved for this render. Null on a failure, so the count
 * hides rather than understates.
 */
export async function decisionCount(personId: string): Promise<number | null> {
  try {
    const access = await getAccess();
    if (!access) return 0;
    return (await approvalsInbox(personId, access, { surface: "team" })).length;
  } catch (err) {
    console.error("[notifications/decision-count]", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * What the team sidebar counts, by the row's address (app/shell.ts,
 * teamNavCounts): the Inbox's asks and its decisions, everything that waits
 * on the person. An empty record draws no count anywhere.
 */
export async function teamNavCounts(personId: string): Promise<Record<string, number>> {
  const [asks, decisions] = await Promise.all([askCount(personId), decisionCount(personId)]);
  return asks === null || decisions === null ? {} : { [TEAM_INBOX_HREF]: asks + decisions };
}
