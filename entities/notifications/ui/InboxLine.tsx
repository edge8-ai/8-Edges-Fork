// The inbox in one line, for a page that is not the inbox (W.169.4). My Week
// draws it under its heading through the InboxLine shell slot (app/shell.ts,
// kernel/shell/page-slots.ts), so boards never names this entity and a
// deployment without an inbox draws nothing.
//
// It says something only when something is new: "0 new" is an alarm about
// nothing, and a line that is always there stops being read. It is a link, not
// a banner to dismiss — reading the items in the Inbox is what clears it.
import Link from "next/link";
import { inboxLine } from "../lib/inbox";

export const TEAM_INBOX_HREF = "/team/inbox";

export async function InboxLine({ personId }: { personId: string }) {
  const line = await inboxLine(personId);
  if (!line || line.unread === 0) return null;
  return (
    <Link className="admin-inbox-line" href={TEAM_INBOX_HREF}>
      <span className="admin-inbox-line-dot" aria-hidden="true" />
      <span className="admin-inbox-line-count">{line.unread} new in your inbox</span>
      {line.latest && <span className="admin-inbox-line-latest">{line.latest}</span>}
      <span className="admin-inbox-line-go">Open inbox</span>
    </Link>
  );
}
