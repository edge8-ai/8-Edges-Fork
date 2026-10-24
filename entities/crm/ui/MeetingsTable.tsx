import { Badge } from "@/kernel/ui/Badge";
import type { AdminMeetingRow } from "@/entities/crm/lib/meetings";

// Publish state plus AI state, shared by the List table, the company 360 tab and
// the Details page so one meeting never reads differently in two places.
export function MeetingStatusBadges({ meeting }: { meeting: AdminMeetingRow }) {
  return (
    <span className="u-row u-wrap">
      {meeting.publishedAt ? <Badge tone="ok">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
      {meeting.aiStatus === "pending" && <Badge tone="warn">Summarizing…</Badge>}
      {meeting.aiStatus === "failed" && <Badge tone="warn">AI failed</Badge>}
    </span>
  );
}
