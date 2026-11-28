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
import { updatePeople } from "@/kernel/identity/writes";
import { one } from "@/kernel/config/embedded";
import { personName } from "@/kernel/config/people-name";
import { addDays, businessDate } from "@/kernel/config/dates";
import { ALWAYS_ON_KINDS, isNotificationKind, NEEDS_YOU_KINDS, NOTIFICATION_KINDS, type NotificationKind } from "./kinds";
import { dueOnOf, dueTitleAsOf } from "./work-kinds";

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
  // TH.2: the card or spark the row is about, and when the person marked it done.
  subject: string | null;
  doneAt: string | null;
  // TH.2.8: who acted, for the face the row shows; null when no one person did
  // (a routine, a finance decision) and for rows written before 2026-10-10.
  actor: { name: string; avatarUrl: string | null } | null;
  // TH.8: the date a due reminder announced, so the team Inbox can group them
  // by it; null on every other kind.
  dueOn: string | null;
};

/**
 * When "Remind me tomorrow" brings an ask back (TH.8.3): nine in the morning,
 * Saigon time, on the next Saigon day. Saigon keeps one offset all year, so the
 * wall time is written with it.
 */
export function remindTomorrowAt(now: Date = new Date()): string {
  return new Date(`${addDays(businessDate(now), 1)}T09:00:00+07:00`).toISOString();
}

/**
 * The inbox as the page lays it out (TH.2): what asks something of the person
 * and is not done yet, and what happened, read ones kept for thirty days and
 * done requests with them.
 */
export type Inbox = { needs: InboxItem[]; happened: InboxItem[] };

/** Whether a kind asks something of its person, and so waits in "Needs you" until done. */
export function needsYou(kind: NotificationKind): boolean {
  return NEEDS_YOU_KINDS.includes(kind);
}

const READ_KEPT_DAYS = 30;
const SCAN = 1000;

/**
 * The words a row shows today. Most rows state a fact that stays true, so they
 * keep the words they were written with; a due row names a day relative to the
 * morning it was written, so it is said again as of today (OV.6.1).
 */
function titleAsOf(r: { kind: string; title: string; event_key: string }, today: string): string {
  return r.kind === "card.due_tomorrow" ? dueTitleAsOf(r.title, r.event_key, today) : r.title;
}

/** The person's inbox as it was written, hidden rows included: what "mark all read" must reach. */
async function inboxRows(personId: string, surface: "admin" | "team", now: Date): Promise<Inbox> {
  const rows = mustRows(
    await companyOs
      .from("notifications")
      .select("id, kind, title, body, admin_href, team_href, created_at, subject, event_key, actor:people!actor_id(display_name, preferred_name, full_name, email, avatar_url)")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(SCAN),
    "[notifications/inbox] notifications",
  );
  const reads = rows.length
    ? mustRows(
        await companyOs.from("notification_reads").select("notification_id, read_at, done_at, snoozed_until").in("notification_id", rows.map((r) => r.id)),
        "[notifications/inbox] notification_reads",
      )
    : [];
  const readAt = new Map(reads.map((r) => [r.notification_id, r.read_at]));
  const doneAt = new Map(reads.map((r) => [r.notification_id, r.done_at]));
  const snoozed = new Set(reads.filter((r) => r.snoozed_until && new Date(r.snoozed_until).getTime() > now.getTime()).map((r) => r.notification_id));
  const cutoff = now.getTime() - READ_KEPT_DAYS * 86_400_000;
  const today = businessDate(now);
  const inbox: Inbox = { needs: [], happened: [] };
  for (const r of rows) {
    if (!isNotificationKind(r.kind)) continue;
    const actor = one(r.actor);
    const item: InboxItem = {
      id: r.id,
      kind: r.kind,
      title: titleAsOf(r, today),
      body: r.body,
      href: surface === "team" ? r.team_href : r.admin_href,
      createdAt: r.created_at,
      readAt: readAt.get(r.id) ?? null,
      subject: r.subject,
      doneAt: doneAt.get(r.id) ?? null,
      actor: actor ? { name: personName(actor), avatarUrl: actor.avatar_url } : null,
      dueOn: r.kind === "card.due_tomorrow" ? dueOnOf(r.event_key) : null,
    };
    // A request waits until it is done, read or not. Once done it joins what
    // happened, and leaves thirty days after it was done, as a read row does.
    // A snoozed one is away until its time comes, then waits again (TH.8.3).
    if (needsYou(item.kind) && !item.doneAt) {
      if (!snoozed.has(item.id)) inbox.needs.push(item);
    }
    else if (item.doneAt) {
      if (new Date(item.doneAt).getTime() >= cutoff) inbox.happened.push(item);
    } else if (!item.readAt || new Date(item.readAt).getTime() >= cutoff) inbox.happened.push(item);
  }
  return inbox;
}

/** The inbox this person may open: what the page lists. */
export async function inboxFor(personId: string, surface: "admin" | "team", now = new Date()): Promise<Inbox> {
  const inbox = await inboxRows(personId, surface, now);
  const mayOpen = await recipientMayOpen(personId);
  const shown = (item: InboxItem) => item.href === null || mayOpen(item.href);
  return { needs: inbox.needs.filter(shown), happened: inbox.happened.filter(shown) };
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
  // not stay unread forever and keep a count above what the page lists. A
  // request read here still waits in "Needs you": read is not done.
  const { needs, happened } = await inboxRows(personId, "team", new Date());
  await markRead(personId, [...needs, ...happened].filter((i) => !i.readAt).map((i) => i.id));
}

/**
 * Marks the person's own items done (TH.2), which also reads them. Done takes a
 * request off "Needs you"; undo clears it again.
 */
export async function markDone(personId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const own = mustRows(
    await companyOs.from("notifications").select("id").eq("person_id", personId).in("id", ids),
    "[notifications/inbox] own notifications",
  );
  if (own.length === 0) return;
  const at = new Date().toISOString();
  const { error } = await companyOs
    .from("notification_reads")
    .upsert(own.map((r) => ({ notification_id: r.id, person_id: personId, done_at: at })), { onConflict: "notification_id" });
  if (error) throw new Error(`[notifications/inbox] notification_reads: ${error.message}`);
}

/**
 * "Remind me tomorrow" on the person's own asks (TH.8.3): each leaves "From
 * teammates" and the count until `until`, then comes back on its own. Snoozing
 * reads it too, as done does.
 */
export async function snooze(personId: string, ids: string[], until: string): Promise<void> {
  if (ids.length === 0) return;
  const own = mustRows(
    await companyOs.from("notifications").select("id").eq("person_id", personId).in("id", ids),
    "[notifications/inbox] own notifications",
  );
  if (own.length === 0) return;
  const { error } = await companyOs
    .from("notification_reads")
    .upsert(own.map((r) => ({ notification_id: r.id, person_id: personId, snoozed_until: until })), { onConflict: "notification_id" });
  if (error) throw new Error(`[notifications/inbox] notification_reads: ${error.message}`);
}

/** Brings snoozed asks back now: the undo of snooze. */
export async function unsnooze(personId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await companyOs.from("notification_reads").update({ snoozed_until: null }).eq("person_id", personId).in("notification_id", ids);
  if (error) throw new Error(`[notifications/inbox] notification_reads: ${error.message}`);
}

/** Puts the person's own items back on "Needs you": the undo of markDone. */
export async function undoDone(personId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await companyOs.from("notification_reads").update({ done_at: null }).eq("person_id", personId).in("notification_id", ids);
  if (error) throw new Error(`[notifications/inbox] notification_reads: ${error.message}`);
}

/** Stops (or restarts) inbox updates about one card or spark for this person (TH.2). */
export async function setSubjectMuted(personId: string, subject: string, muted: boolean): Promise<void> {
  const { error } = muted
    ? await companyOs.from("notification_mutes").upsert({ person_id: personId, subject }, { onConflict: "person_id,subject", ignoreDuplicates: true })
    : await companyOs.from("notification_mutes").delete().eq("person_id", personId).eq("subject", subject);
  if (error) throw new Error(`[notifications/inbox] notification_mutes: ${error.message}`);
}

/** The cards and sparks this person stopped updates about. */
export async function mutedSubjects(personId: string): Promise<Set<string>> {
  const rows = mustRows(
    await companyOs.from("notification_mutes").select("subject").eq("person_id", personId),
    "[notifications/inbox] notification_mutes",
  );
  return new Set(rows.map((r) => r.subject));
}

/** Every kind with whether this person muted it, in the order the page lists them. */
export async function prefsFor(personId: string): Promise<{ kind: NotificationKind; label: string; muted: boolean; alwaysOn: boolean }[]> {
  const rows = mustRows(
    await companyOs.from("notification_prefs").select("kind, muted").eq("person_id", personId),
    "[notifications/inbox] notification_prefs",
  );
  const muted = new Set(rows.filter((r) => r.muted).map((r) => r.kind));
  return (Object.keys(NOTIFICATION_KINDS) as NotificationKind[]).map((kind) => {
    const alwaysOn = ALWAYS_ON_KINDS.includes(kind);
    return { kind, label: NOTIFICATION_KINDS[kind], muted: !alwaysOn && muted.has(kind), alwaysOn };
  });
}

export async function setMuted(personId: string, kind: NotificationKind, muted: boolean): Promise<void> {
  // A direct request is always on (TH.2): the page offers no switch, and a
  // crafted call cannot turn one off either.
  if (ALWAYS_ON_KINDS.includes(kind)) throw new Error("Asks made of you by name always reach your inbox.");
  const { error } = await companyOs
    .from("notification_prefs")
    .upsert({ person_id: personId, kind, muted }, { onConflict: "person_id,kind" });
  if (error) throw new Error(`[notifications/inbox] notification_prefs: ${error.message}`);
}

/**
 * Whether work notices also reach this person as a Lark message (TH.2). The
 * switch is the person's own Lark DM opt-out on people, which every Lark DM
 * already honours (kernel/messaging/dm-preference.ts); the inbox only shows it
 * where the person decides what reaches them. On unless they turned it off.
 */
export async function larkEchoFor(personId: string): Promise<boolean> {
  const row = mustRows(
    await companyOs.from("people").select("lark_dm_opt_out").eq("id", personId).limit(1),
    "[notifications/inbox] people.lark_dm_opt_out",
  )[0] as { lark_dm_opt_out: boolean | null } | undefined;
  return !row?.lark_dm_opt_out;
}

export async function setLarkEcho(personId: string, on: boolean): Promise<void> {
  const { error } = await updatePeople({ lark_dm_opt_out: !on }).eq("id", personId);
  if (error) throw new Error(`[notifications/inbox] people.lark_dm_opt_out: ${error.message}`);
}

/** What the one-line teaser on another page says: how many are unread, and the newest one's sentence. */
/** The team Inbox's address: the sidebar row, the phone bar and My Week's line all lead here. */
export const TEAM_INBOX_HREF = "/team/inbox";

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
      .select("id, kind, title, team_href, event_key")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(LINE_SCAN),
    "[notifications/inbox-line] recent notifications",
    [] as { id: string; kind: string; title: string; team_href: string | null; event_key: string }[],
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
  const latest = recent.find((r) => !readIds.has(r.id) && (r.team_href === null || mayOpen(r.team_href)));
  return { unread, latest: latest ? titleAsOf(latest, businessDate(new Date())) : null };
}
