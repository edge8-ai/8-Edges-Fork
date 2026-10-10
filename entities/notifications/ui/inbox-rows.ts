// The inbox's items as the page shows them, worded on the server (S.3): the
// relative time is computed once, where the request is served, so the browser
// renders the same text the server sent and hydration has nothing to disagree on.
import { timeAgo } from "@/kernel/ui/format";
import type { InboxItem } from "@/entities/notifications/lib/inbox";
import type { InboxRow } from "./InboxView";

export function inboxRows(items: InboxItem[]): InboxRow[] {
  return items.map((i) => ({ id: i.id, title: i.title, body: i.body, href: i.href, when: timeAgo(i.createdAt) }));
}
