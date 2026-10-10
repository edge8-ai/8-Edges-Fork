import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { humanize } from "@/kernel/ui/format";
import type { EventStatus } from "@/entities/retreats";

// Shared, server-safe (deliberately NO "use client"): the event detail page
// is a server component and CALLS this as a plain function. When it lived in
// EventsTable.tsx (a client module), the server got a client-reference proxy
// instead of the function — "(0, x.P) is not a function" at request time,
// which neither tsc nor next build catches.

const STATUS_TONE: Record<EventStatus, BadgeTone> = {
  draft: "neutral",
  published: "info",
  open: "ok",
  closed: "warn",
  completed: "info",
  cancelled: "err",
};

export function eventStatusBadge(status: EventStatus, archivedAt: string | null) {
  if (archivedAt) return <Badge tone="neutral">Archived</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{humanize(status)}</Badge>;
}
