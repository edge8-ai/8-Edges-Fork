// The team Inbox as the TH.8 canvas lays it out, shaped on the server so the
// client only draws (https://claude.ai/artifact/X23oprxriPpthYXjvbKmXi):
//  - asks: what a teammate asked of the person and is not done (ASK_KINDS).
//    They lead the page, and they are what the sidebar counts.
//  - dates: the routine's due reminders, grouped by the date they announced
//    and, within a date, under the card a subtask belongs to. Every reminder
//    is listed; the page bounds the list's height, it never folds it.
//  - cleared: reminders about cards that are no longer work (finished, set
//    aside, archived). They say nothing true any more, so they are left out.
//  - days: what happened, as the admin Inbox shows it, without the reminders
//    the person cleared, which are not news.
import type { InboxCardFact } from "@/entities/boards";
import type { Inbox, InboxItem } from "@/entities/notifications/lib/inbox";
import { ASK_KINDS, DECISION_KINDS, REMINDER_KINDS } from "@/entities/notifications/lib/kinds";
import { happenedDays, needsRows, type InboxDay, type InboxRow } from "./inbox-rows";

/** One reminder: a card past the date it was given. */
export type DueRow = { ids: string[]; title: string; href: string | null; unread: boolean };
/** A card and the subtasks of it that are past their date; `head` is null when the card itself is not. */
export type DueCluster = { key: string; title: string; head: DueRow | null; kids: DueRow[]; ids: string[] };
/** Every reminder that announced one date. */
export type DueDate = { day: string; label: string; dow: string; dd: string; ids: string[]; clusters: DueCluster[] };

export type TeamInbox = {
  asks: InboxRow[];
  dates: DueDate[];
  dueIds: string[];
  cleared: string[];
  days: InboxDay[];
  unreadUpdates: number;
};

const isAsk = (i: InboxItem) => ASK_KINDS.includes(i.kind);
const isReminder = (i: InboxItem) => REMINDER_KINDS.includes(i.kind);
// TH.11: decisions are the Decisions section's (time-off, through a slot), never a row here.
const isDecision = (i: InboxItem) => DECISION_KINDS.includes(i.kind);
const cardOf = (i: InboxItem) => (i.subject?.startsWith("card:") ? i.subject.slice("card:".length) : null);

function dateParts(day: string): { label: string; dow: string; dd: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const dow = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  return { label, dow, dd: String(d.getUTCDate()) };
}

/** The words a reminder shows under its date: the card's own title when boards could say it, else the sentence. */
function reminderTitle(item: InboxItem, fact: InboxCardFact | undefined): string {
  return fact?.title ?? item.title;
}

/**
 * The reminders, grouped. `facts` is null when boards is not installed or
 * could not be read: then nothing is left out and nothing nests, so a failed
 * read shows every reminder flat rather than hiding any.
 */
export function dueDates(items: InboxItem[], facts: Map<string, InboxCardFact> | null, href: (i: InboxItem) => string | null): { dates: DueDate[]; cleared: string[] } {
  // One reminder per card: a card whose date moved has a reminder per date, and
  // the newest says where it stands.
  const byCard = new Map<string, InboxItem[]>();
  for (const i of items) {
    const key = cardOf(i) ?? i.id;
    (byCard.get(key) ?? byCard.set(key, []).get(key) ?? []).push(i);
  }
  const cleared: string[] = [];
  const live: { card: string; item: InboxItem; ids: string[]; fact: InboxCardFact | undefined }[] = [];
  for (const [card, group] of byCard) {
    const fact = facts?.get(card);
    if (facts && (!fact || !fact.open)) {
      cleared.push(fact?.title ?? group[0].title);
      continue;
    }
    live.push({ card, item: group[0], ids: group.map((i) => i.id), fact });
  }

  const days = [...new Set(live.map((r) => r.item.dueOn ?? r.item.createdAt.slice(0, 10)))].sort().reverse();
  const dates = days.map((day) => {
    const onDay = live.filter((r) => (r.item.dueOn ?? r.item.createdAt.slice(0, 10)) === day);
    const clusters = new Map<string, DueCluster>();
    for (const r of onDay) {
      const key = r.fact?.parent?.id ?? r.card;
      const row: DueRow = { ids: r.ids, title: reminderTitle(r.item, r.fact), href: href(r.item), unread: !r.item.readAt };
      const cluster = clusters.get(key) ?? { key, title: r.fact?.parent?.title ?? row.title, head: null, kids: [], ids: [] };
      if (key === r.card) cluster.head = row;
      else cluster.kids.push(row);
      cluster.ids.push(...r.ids);
      clusters.set(key, cluster);
    }
    return { day, ...dateParts(day), ids: onDay.flatMap((r) => r.ids), clusters: [...clusters.values()] };
  });
  return { dates, cleared };
}

/** The cards the person's open reminders name: what the page asks boards about. */
export function remindedCards(inbox: Inbox): string[] {
  return [...new Set(inbox.needs.filter(isReminder).map(cardOf).filter((id): id is string => id !== null))];
}

/** The whole page's model. `open` is how a row's link reads on this page (opened in place, or its own link). */
export function teamInbox(inbox: Inbox, facts: Map<string, InboxCardFact> | null, open: (row: InboxRow) => InboxRow, now: Date = new Date()): TeamInbox {
  const asks = needsRows(inbox.needs.filter(isAsk)).map(open);
  const href = (i: InboxItem) => open(needsRows([i])[0]).href;
  const { dates, cleared } = dueDates(inbox.needs.filter(isReminder), facts, href);
  const days = happenedDays(inbox.happened.filter((i) => !isReminder(i) && !isDecision(i)), now).map((d) => ({ ...d, rows: d.rows.map(open) }));
  return {
    asks,
    dates,
    dueIds: dates.flatMap((d) => d.ids),
    cleared,
    days,
    unreadUpdates: days.reduce((n, d) => n + d.rows.filter((r) => r.unread).length, 0),
  };
}

/** "Good morning", "Good afternoon" or "Good evening", by the Saigon clock the team works to. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Ho_Chi_Minh" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

