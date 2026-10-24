// The notification router's morning flush (Z.7): sends what
// company_os.notification_queue holds once it is due. A held notice goes on its
// own, under its own dedupe key; digest items go as one message per recipient,
// under messaging:digest:<recipient>:<date>, so each person and each chat gets
// at most one digest a working day however often the flush runs. The routine
// that calls this runs on working mornings and hourly through the working day,
// so a send that failed at 08:30 is tried again within the hour.
//
// Every send claims its key in the effect ledger first (once()), and a row is
// marked only for what that claim says happened. In shadow (Z.17) the flush
// records each send it would have made and changes no row, so a held notice
// still waits for the first live run.
import { once } from "@/kernel/audit/effects";
import { currentRunMode } from "@/kernel/audit/run-context";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { businessDate } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";
import { nextWorkingMorning } from "./business-hours";
import type { LarkMessage } from "./lark";
import { deliverNotice, describeTo, isLarkChat, type NoticeTo } from "./router";

// A cron fires a little after its minute, never long before; the grace lets a
// run that starts at 08:29:50 still send what is due at 08:30.
const GRACE_MS = 15 * 60 * 1000;
// After this many failed sends a row is marked failed and left for a person:
// three working hours of Lark refusing one notice is not going to change.
const MAX_ATTEMPTS = 3;
const READ_LIMIT = 500;
// A digest item's text is cut here, so one long notice cannot crowd out the rest.
const ITEM_MAX = 1500;

type QueueRow = {
  id: string;
  kind: string;
  channel: string;
  recipient: string;
  subject: string;
  message: unknown;
  reason: string;
  dedupe_key: string;
  attempts: number;
};

// What the flush may change on a queued row.
type RowPatch = Partial<{
  status: "sent" | "skipped" | "failed";
  sent_at: string;
  carried_by: string;
  error: string | null;
  attempts: number;
  deliver_after: string;
}>;

export type FlushResult = {
  due: number;
  sent: number;
  digests: number;
  skipped: number;
  carried: number;
  shadow: number;
  failures: RoutineFailure[];
};

/** Send every queued notice due by `now`. A failed read or send comes back as a failure the routine reports. */
export async function flushNotifications(now: Date = new Date()): Promise<FlushResult> {
  const out: FlushResult = { due: 0, sent: 0, digests: 0, skipped: 0, carried: 0, shadow: 0, failures: [] };
  const { data, error } = await companyOs
    .from("notification_queue")
    .select("id, kind, channel, recipient, subject, message, reason, dedupe_key, attempts")
    .eq("status", "queued")
    .lte("deliver_after", new Date(now.getTime() + GRACE_MS).toISOString())
    .order("deliver_after", { ascending: true })
    .limit(READ_LIMIT);
  if (error) {
    out.failures.push({ subject: "notification queue", step: "read what is due", error: error.message });
    return out;
  }
  const rows = (data ?? []) as QueueRow[];
  out.due = rows.length;
  const shadow = currentRunMode() === "shadow";

  for (const row of rows.filter((r) => r.reason === "held")) await flushHeld(row, now, shadow, out);

  const groups = new Map<string, QueueRow[]>();
  for (const row of rows.filter((r) => r.reason === "digest")) {
    const key = `${row.channel}\u0000${row.recipient}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) await flushDigest(group, now, shadow, out);
  return out;
}

/** The message a row holds, or null when it is not one the router wrote. */
function messageOf(row: QueueRow): LarkMessage | null {
  const m = row.message as { text?: unknown; card?: unknown } | null;
  if (typeof m?.text === "string") return m.text;
  if (m?.card && typeof m.card === "object") return { card: m.card as Record<string, unknown> };
  return null;
}

/** Where a row goes, or why it cannot go anywhere. */
function toOf(row: QueueRow): NoticeTo | string {
  if (row.channel === "lark_dm") return { person: row.recipient };
  if (row.channel === "lark_chat") return isLarkChat(row.recipient) ? { chat: row.recipient } : `unknown chat ${row.recipient}`;
  return `the ${row.channel} channel is not built yet`;
}

async function flushHeld(row: QueueRow, now: Date, shadow: boolean, out: FlushResult): Promise<void> {
  const message = messageOf(row);
  const to = toOf(row);
  if (!message || typeof to === "string") {
    await mark([row], { status: "failed", attempts: row.attempts + 1, error: message ? (to as string) : "the queued message is unreadable" }, out);
    out.failures.push({ subject: `${row.kind} notice`, step: "send a held notice", error: message ? (to as string) : "unreadable message" });
    return;
  }
  const summary = `Lark ${row.kind} notice to ${describeTo(to)}, held through quiet hours: ${row.subject}`;
  await sendRows([row], row.dedupe_key, to, message, summary, now, shadow, out, "send a held notice");
}

async function flushDigest(group: QueueRow[], now: Date, shadow: boolean, out: FlushResult): Promise<void> {
  const first = group[0];
  const to = toOf(first);
  if (typeof to === "string") {
    await mark(group, { status: "failed", error: to }, out, true);
    out.failures.push({ subject: "digest", step: "send the morning digest", error: to });
    return;
  }
  const date = businessDate(now);
  const key = `messaging:digest:${first.recipient.toLowerCase()}:${date}`;
  const summary = `Lark digest to ${describeTo(to)} with ${group.length} notice${group.length === 1 ? "" : "s"}`;
  await sendRows(group, key, to, digestText(group, date), summary, now, shadow, out, "send the morning digest");
}

/**
 * One digest message: a heading, then each notice. A text notice is carried
 * whole (cut at ITEM_MAX); a card cannot be nested in a text message, so a
 * card is listed by its subject.
 */
function digestText(rows: QueueRow[], date: string): string {
  const items = rows.map((row) => {
    const m = messageOf(row);
    if (typeof m === "string") return `• ${m.length > ITEM_MAX ? `${m.slice(0, ITEM_MAX - 1).trimEnd()}…` : m}`;
    return `• ${row.subject}`;
  });
  return [`Morning digest for ${date}: ${rows.length} notice${rows.length === 1 ? "" : "s"} that waited for working hours`, "", ...items].join("\n");
}

async function sendRows(
  rows: QueueRow[],
  key: string,
  to: NoticeTo,
  message: LarkMessage,
  summary: string,
  now: Date,
  shadow: boolean,
  out: FlushResult,
  step: string,
): Promise<void> {
  const seen: { declined: string | null } = { declined: null };
  const r = await once(
    key,
    "lark",
    async () => {
      const sent = await deliverNotice(to, message);
      if (sent.ok) return { ok: true };
      if (sent.declined) seen.declined = sent.reason;
      return { ok: false, error: sent.reason };
    },
    { summary, detail: { rows: rows.length } },
  );
  if (shadow || (!r.acted && r.shadow)) {
    out.shadow += 1;
    return;
  }
  const isDigest = rows[0].reason === "digest";
  if (!r.acted) {
    await settleFromLedger(rows, key, now, isDigest, out);
    return;
  }
  if (r.outcome.ok) {
    await mark(rows, { status: "sent", sent_at: now.toISOString(), carried_by: key, error: null }, out, true);
    if (isDigest) out.digests += 1;
    else out.sent += 1;
    return;
  }
  if (seen.declined) {
    await mark(rows, { status: "skipped", error: seen.declined }, out, true);
    out.skipped += rows.length;
    return;
  }
  const error = r.outcome.error;
  for (const row of rows) {
    const attempts = row.attempts + 1;
    await mark([row], { attempts, error, ...(attempts >= MAX_ATTEMPTS ? { status: "failed" } : {}) }, out);
  }
  out.failures.push({ subject: isDigest ? `digest to ${describeTo(to)}` : `${rows[0].kind} notice`, step, error });
}

/**
 * The key was not claimed by this run. Done means the notice went: a held row
 * is marked sent (its own key carried it), and digest rows that missed today's
 * digest move to the next working morning, since today's key is spent.
 * Claimed or unknown means another run is sending or a person has to decide
 * (the runbook's unknown-effect step), so the rows are left as they are.
 */
async function settleFromLedger(rows: QueueRow[], key: string, now: Date, isDigest: boolean, out: FlushResult): Promise<void> {
  const { data, error } = await companyOs.from("automation_effects").select("status, done_at").eq("key", key).maybeSingle();
  if (error) {
    out.failures.push({ subject: key, step: "read the effect ledger", error: error.message });
    return;
  }
  if (data?.status !== "done") return;
  if (isDigest) {
    await mark(rows, { deliver_after: nextWorkingMorning(now).toISOString() }, out, true);
    out.carried += rows.length;
  } else {
    await mark(rows, { status: "sent", sent_at: data.done_at ?? now.toISOString(), carried_by: key }, out, true);
    out.sent += 1;
  }
}

/**
 * Update rows still queued. Fenced to status queued, so two runs cannot both
 * settle one row. `bumpAttempts` counts this attempt on each row when the
 * patch does not set attempts itself.
 */
async function mark(rows: QueueRow[], patch: RowPatch, out: FlushResult, bumpAttempts = false): Promise<void> {
  for (const row of rows) {
    const { error } = await companyOs
      .from("notification_queue")
      .update({ ...(bumpAttempts && patch.attempts === undefined && patch.deliver_after === undefined ? { attempts: row.attempts + 1 } : {}), ...patch })
      .eq("id", row.id)
      .eq("status", "queued");
    if (error) out.failures.push({ subject: `${row.kind} notice`, step: "mark the queue row", error: error.message });
  }
}
