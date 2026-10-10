// What a person's inbox holds, and the three things they can do to it: mark an
// item read, mark everything read, and mute a kind (S.3).
//
// Every function takes the person id from the caller's guard, never from the
// browser, so an inbox is only ever its owner's. The page reads a person's
// newest thousand items: unread ones among them stay until read, read ones stay
// visible for thirty days so "what did that say" has an answer (the rows remain).
// A thousand is years of facts at the rate the catalogue produces them.
//
// The inbox is never a side door (AC.15, ADR 0013). deliver.ts keeps a link off
// a row the recipient could not open when it is written; the page asks again
// when it is read, because access changes after a row is written (a role
// revoked, a page that moved behind a new permission). A row whose link the
// viewer may not open is not shown, and so is a row whose link no page
// declares, which is the closed default. A row that links nowhere stays: it
// shows a sentence and points at nothing.
import { companyOs } from "@/kernel/data/supabase";
import { countOr, mustRows, readOr } from "@/kernel/data/read";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { isNotificationKind, NOTIFICATION_KINDS, type NotificationKind } from "./kinds";

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export type Inbox = { unread: InboxItem[]; read: InboxItem[] };

const READ_KEPT_DAYS = 30;
const SCAN = 1000;

/** The person's inbox as it was written, hidden rows included: what "mark all read" must reach. */
async function inboxRows(personId: string, surface: "admin" | "team", now: Date): Promise<Inbox> {
  const rows = mustRows(
    await companyOs
      .from("notifications")
      .select("id, kind, title, body, admin_href, team_href, created_at")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(SCAN),
    "[notifications/inbox] notifications",
  );
  const reads = rows.length
    ? mustRows(
        await companyOs.from("notification_reads").select("notification_id, read_at").in("notification_id", rows.map((r) => r.id)),
        "[notifications/inbox] notification_reads",
      )
    : [];
  const readAt = new Map(reads.map((r) => [r.notification_id, r.read_at]));
  const cutoff = now.getTime() - READ_KEPT_DAYS * 86_400_000;
  const inbox: Inbox = { unread: [], read: [] };
  for (const r of rows) {
    if (!isNotificationKind(r.kind)) continue;
    const item: InboxItem = {
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      href: surface === "team" ? r.team_href : r.admin_href,
      createdAt: r.created_at,
      readAt: readAt.get(r.id) ?? null,
    };
    if (!item.readAt) inbox.unread.push(item);
    else if (new Date(item.readAt).getTime() >= cutoff) inbox.read.push(item);
  }
  return inbox;
}

/** The inbox this person may open: what the page lists. */
export async function inboxFor(personId: string, surface: "admin" | "team", now = new Date()): Promise<Inbox> {
  const inbox = await inboxRows(personId, surface, now);
  const mayOpen = await recipientMayOpen(personId);
  const shown = (item: InboxItem) => item.href === null || mayOpen(item.href);
  return { unread: inbox.unread.filter(shown), read: inbox.read.filter(shown) };
}

/** Marks the person's own items read; ids that are not theirs are ignored. */
export async function markRead(personId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const own = mustRows(
    await companyOs.from("notifications").select("id").eq("person_id", personId).in("id", ids),
    "[notifications/inbox] own notifications",
  );
  if (own.length === 0) return;
  const { error } = await companyOs
    .from("notification_reads")
    .upsert(own.map((r) => ({ notification_id: r.id, person_id: personId })), { onConflict: "notification_id", ignoreDuplicates: true });
  if (error) throw new Error(`[notifications/inbox] notification_reads: ${error.message}`);
}

export async function markAllRead(personId: string): Promise<void> {
  // Every unread row, the ones the page hides too: a row nobody can open must
  // not stay unread forever and keep a count above what the page lists.
  const { unread } = await inboxRows(personId, "team", new Date());
  await markRead(personId, unread.map((i) => i.id));
}

/** Every kind with whether this person muted it, in the order the page lists them. */
export async function prefsFor(personId: string): Promise<{ kind: NotificationKind; label: string; muted: boolean }[]> {
  const rows = mustRows(
    await companyOs.from("notification_prefs").select("kind, muted").eq("person_id", personId),
    "[notifications/inbox] notification_prefs",
  );
  const muted = new Set(rows.filter((r) => r.muted).map((r) => r.kind));
  return (Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => ({ kind, label: NOTIFICATION_KINDS[kind], muted: muted.has(kind) }));
}

export async function setMuted(personId: string, kind: NotificationKind, muted: boolean): Promise<void> {
  const { error } = await companyOs
    .from("notification_prefs")
    .upsert({ person_id: personId, kind, muted }, { onConflict: "person_id,kind" });
  if (error) throw new Error(`[notifications/inbox] notification_prefs: ${error.message}`);
}

/** What the one-line teaser on another page says: how many are unread, and the newest one's sentence. */
export type InboxLineSummary = { unread: number; latest: string | null };

const LINE_SCAN = 20;

/**
 * The inbox in one line (W.169.4), for a page that is not the inbox — My Week
 * shows it under its heading. Counted rather than listed: unread is every row
 * of the person's minus the ones they have read (a read row exists only for
 * their own items, markRead sees to that), so no page of rows is fetched to
 * count it. The newest unread sentence comes from the latest few rows.
 *
 * A failure here is a teaser that does not show, not a page that breaks: the
 * line is a convenience on someone else's page, and the Inbox page itself
 * reads with mustRows and says so when it fails. So this read is tolerant and
 * names its fallback: null, which the caller draws as nothing.
 */
export async function inboxLine(personId: string): Promise<InboxLineSummary | null> {
  const [total, read] = await Promise.all([
    companyOs.from("notifications").select("id", { count: "exact", head: true }).eq("person_id", personId),
    companyOs.from("notification_reads").select("notification_id", { count: "exact", head: true }).eq("person_id", personId),
  ]);
  const all = countOr(total, "[notifications/inbox-line] notifications", -1);
  const seen = countOr(read, "[notifications/inbox-line] notification_reads", -1);
  if (all < 0 || seen < 0) return null;
  const unread = Math.max(0, all - seen);
  if (unread === 0) return { unread, latest: null };

  const recent = readOr(
    await companyOs
      .from("notifications")
      .select("id, title, team_href")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(LINE_SCAN),
    "[notifications/inbox-line] recent notifications",
    [] as { id: string; title: string; team_href: string | null }[],
  );
  const readIds = new Set(
    recent.length
      ? readOr(
          await companyOs.from("notification_reads").select("notification_id").in("notification_id", recent.map((r) => r.id)),
          "[notifications/inbox-line] recent reads",
          [] as { notification_id: string }[],
        ).map((r) => r.notification_id)
      : [],
  );
  // The sentence is another page's headline, so it names only a row the viewer
  // may open, as the inbox does; a lookup that fails names none. The count above
  // is of rows, and "mark all read" reaches the hidden ones, so it settles.
  const mayOpen = await recipientMayOpen(personId).catch((err) => {
    console.error("[notifications/inbox-line] access", err instanceof Error ? err.message : err);
    return () => false;
  });
  return { unread, latest: recent.find((r) => !readIds.has(r.id) && (r.team_href === null || mayOpen(r.team_href)))?.title ?? null };
}
