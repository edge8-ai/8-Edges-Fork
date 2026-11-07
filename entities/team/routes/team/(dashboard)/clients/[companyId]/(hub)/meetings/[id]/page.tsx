import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { getClientMeetingForActor } from "@/entities/team/lib/hub-meetings";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";
import { formatDate } from "@/kernel/ui/format";

export const metadata = { title: "Meeting recap" };

// One meeting's recap inside the client hub: the AI summary the client sees
// on /portal/meetings/[id], plus its publish state, since team members see
// drafts too. A meeting outside the actor's assigned companies, or one that
// belongs to another company than the URL names, 404s.
export default async function TeamClientMeetingPage(props: { params: Promise<{ companyId: string; id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.clients");
  const params = await props.params;
  const actor = await requireTeamMember();
  const meeting = await getClientMeetingForActor(actor, params.companyId, params.id);
  if (!meeting) notFound();

  const summaryHtml = meeting.aiSummary ? await renderPlanMarkdown(meeting.aiSummary) : null;
  const published = !!meeting.publishedAt;

  return (
    <>
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href={`/team/clients/${params.companyId}/meetings`}>
          ← All meetings
        </Link>
      </div>

      <PageHead
        eyebrow="Client hub · Meetings"
        title={meeting.title || "Untitled meeting"}
        sub={meeting.meetingDate ? formatDate(meeting.meetingDate) : "Date not set"}
        action={<Badge tone={published ? "ok" : "neutral"}>{published ? "Published" : "Draft"}</Badge>}
      />

      <div className="admin-card admin-section-card">
        <div className="admin-cell-muted u-sm">
          <strong>Attendees:</strong> {meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "—"}
          {meeting.aiProgramName && (
            <div className="u-mt-1">
              <strong>AI Program:</strong> {meeting.aiProgramName}
            </div>
          )}
        </div>
        {meeting.aiStatus === "pending" ? (
          <div className="admin-cell-muted u-mt-3">Generating the summary…</div>
        ) : summaryHtml ? (
          <div className="admin-idea-plan u-mt-3" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
        ) : (
          <div className="admin-cell-muted u-mt-3">No summary yet.</div>
        )}
      </div>
    </>
  );
}
