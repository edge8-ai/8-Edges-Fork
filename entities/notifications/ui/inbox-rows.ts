// The inbox's items as the page shows them, worded on the server (S.3, TH.2):
// the relative time is computed once, where the request is served, so the
// browser renders the same text the server sent and hydration has nothing to
// disagree on.
//
// TH.2 lays them out as the approved canvas does:
//  - "Needs you": the requests not yet done, newest first.
//  - "What happened": everything else, by Saigon day.
// Several rows of one kind about one card or spark (a burst of comments, three
// subtasks ticked) show as ONE row, the newest one's words with a line saying
// how many it stands for, as GitHub, Notion and ClickUp do. Nothing folds: the
// card itself holds every comment.
import { initials, timeAgo } from "@/kernel/ui/format";
import { addDays, businessDate } from "@/kernel/config/dates";
import { isUuid } from "@/kernel/config/slug";
import type { IconName } from "@/kernel/ui/Icon";
import type { InboxItem } from "@/entities/notifications/lib/inbox";
import type { NotificationKind } from "@/entities/notifications/lib/kinds";

export type InboxRow = {
  /** Every item the row stands for, so read and done reach all of them. */
  ids: string[];
  kind: NotificationKind;
  icon: IconName;
  title: string;
  body: string | null;
  href: string | null;
  when: string;
  /** "3 comments on this card, newest shown", when the row stands for more than one. */
  bundle: string | null;
  unread: boolean;
  done: boolean;
  /** The primary action's word on a request: what opening it is for. */
  action: string;
  subject: string | null;
  /** TH.2.8: who acted, drawn where the kind's icon would be; null keeps the icon. */
  face: { initials: string; avatarUrl: string | null } | null;
};

export type InboxDay = { label: string; rows: InboxRow[] };

const ICON: Record<NotificationKind, IconName> = {
  "card.assigned": "columns",
  "card.mentioned": "comment",
  "card.commented": "comment",
  "approval.waiting": "check",
  "card.replied": "comment",
  "blocker.handed": "alert",
  "coaching.one_on_one": "calendar",
  "review.needs_you": "pencil",
  "card.due_tomorrow": "clock",
  "card.completed": "check",
  "card.set_aside": "close",
  "subtask.done": "checklist",
  "leave.approved": "calendar",
  "leave.withdrawn": "calendar",
  "hire.made": "gear",
  "deal.won": "bolt",
  "invoice.paid": "paperclip",
  "claim.decided": "paperclip",
  "claim.paid": "paperclip",
  "idea.built": "bulb",
  "idea.picked_up": "bulb",
  "idea.shipped": "spark",
  "idea.set_aside": "bulb",
  "kudos.received": "spark",
  "training.prep_ready": "calendar",
  "training.session_today": "clock",
  "training.homework_due": "checklist",
  "training.note_updated": "pencil",
  "training.recap_ready": "comment",
  "training.recap_published": "check",
  "training.weekly_recap_waiting": "calendar",
  "training.weekly_recap_held": "alert",
  "quest.called": "bolt",
  "quest.reacted": "comment",
};

const ACTION: Partial<Record<NotificationKind, string>> = {
  "card.assigned": "Open card",
  "card.due_tomorrow": "Open card",
  "card.mentioned": "Reply",
  "card.commented": "Reply",
  "approval.waiting": "Review",
  "card.replied": "Reply",
  "blocker.handed": "Open card",
  "coaching.one_on_one": "Open 1-1",
  "review.needs_you": "Open review",
};

const BUNDLE_NOUN: Partial<Record<NotificationKind, [string, string]>> = {
  "card.commented": ["comment", "comments"],
  "card.mentioned": ["mention", "mentions"],
  "card.replied": ["reply", "replies"],
  "blocker.handed": ["blocker", "blockers"],
  "subtask.done": ["subtask ticked", "subtasks ticked"],
  "idea.built": ["build", "builds"],
};

function bundleLine(kind: NotificationKind, count: number, about: "card" | "spark"): string {
  const [one, many] = BUNDLE_NOUN[kind] ?? ["update", "updates"];
  return `${count} ${count === 1 ? one : many} on this ${about}, newest shown`;
}

/** Items of one kind about one subject, newest first, as one row. Items without a subject stay alone. */
function bundled(items: InboxItem[], key: (i: InboxItem) => string): InboxRow[] {
  const groups = new Map<string, InboxItem[]>();
  for (const i of items) {
    const k = i.subject ? `${i.kind}|${i.subject}|${key(i)}` : `solo|${i.id}`;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  return [...groups.values()].map((group) => {
    const head = group[0];
    const about = head.subject?.startsWith("idea:") ? "spark" : "card";
    return {
      ids: group.map((i) => i.id),
      kind: head.kind,
      icon: ICON[head.kind],
      title: head.title,
      body: head.body,
      href: head.href,
      when: timeAgo(head.doneAt ?? head.createdAt),
      bundle: group.length > 1 ? bundleLine(head.kind, group.length, about) : null,
      unread: group.some((i) => !i.readAt),
      done: group.every((i) => !!i.doneAt),
      action: ACTION[head.kind] ?? (head.href ? "Open" : "Done"),
      subject: head.subject,
      // The newest item's person, as the row shows the newest item's words.
      face: head.actor ? { initials: initials(head.actor.name), avatarUrl: head.actor.avatarUrl } : null,
    };
  });
}

/** "Needs you": one row per request kind per card, newest first. */
export function needsRows(items: InboxItem[]): InboxRow[] {
  return bundled(items, () => "");
}

/** The Saigon day an item counts for: when it was done, or else when it arrived. */
function dayOf(i: InboxItem): string {
  return businessDate(i.doneAt ?? i.createdAt);
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day > addDays(today, -7)) return "Earlier this week";
  return "Earlier";
}

/** "What happened": by Saigon day, newest day first, one row per kind per card per day. */
export function happenedDays(items: InboxItem[], now: Date = new Date()): InboxDay[] {
  const today = businessDate(now);
  const ordered = [...items].sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt));
  const days: InboxDay[] = [];
  for (const label of ["Today", "Yesterday", "Earlier this week", "Earlier"]) {
    const inDay = ordered.filter((i) => dayLabel(dayOf(i), today) === label);
    if (inDay.length > 0) days.push({ label, rows: bundled(inDay, dayOf) });
  }
  return days;
}

/**
 * TH.2.6: on a page that can open a card in place, a card's row opens it there
 * rather than on its board: the row links to the page's own address with
 * `?card=`, which the page answers with the card's drawer over the list. A
 * spark, and a row the surface gives no link, keeps what it had.
 */
export function inPlace(path: string, needs: InboxRow[], days: InboxDay[]): { needs: InboxRow[]; days: InboxDay[] } {
  const open = (row: InboxRow): InboxRow => {
    const card = row.subject?.startsWith("card:") ? row.subject.slice("card:".length) : null;
    return card && row.href ? { ...row, href: `${path}?card=${card}` } : row;
  };
  return { needs: needs.map(open), days: days.map((d) => ({ ...d, rows: d.rows.map(open) })) };
}

/** The card the page's address names, when it names one the way `inPlace` writes it. */
export function cardParam(params: { card?: string | string[] }): string | null {
  const card = typeof params.card === "string" ? params.card.toLowerCase() : null;
  return card && isUuid(card) ? card : null;
}
