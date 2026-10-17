import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { getMeeting } from "@/entities/crm/lib/meetings";
import { PageHead } from "@/kernel/ui/PageHead";
import { surfaceBase } from "@/kernel/shell/surface";
import { MeetingStatusBadges } from "@/entities/crm/ui/MeetingsTable";
import { MeetingControls } from "@/entities/crm/ui/MeetingControls";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";
import { formatDate } from "@/kernel/ui/format";
import { mayProp } from "@/kernel/identity/may-prop";
import { meetingProposal } from "@/entities/crm/lib/proposal-view";
import { MeetingProposalPanel } from "@/entities/crm/ui/MeetingProposalPanel";
import { followupPanelData } from "@/entities/crm/lib/meeting-actions/view";
import { MeetingFollowupPanel } from "@/entities/crm/ui/MeetingFollowupPanel";
import { fileMeetingActionsOnBoard, meetingCardsView } from "@/entities/boards";

export const metadata = {
  title: "Client Meetings",
};

// Details page: everything for one meeting. The AI summary, the raw transcript
// (admin-only) and the mutations — publish to client, edit, retry, delete.
export default async function MeetingDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const surface = await surfaceBase();
  const access = await requirePermission("crm.calls");
  const meeting = await getMeeting(params.id);
  if (!meeting) notFound();
  const proposal = await meetingProposal(meeting.id);
  // The meeting-to-actions chain's panel (Z.13): the run, its actions and
  // their cards, and the follow-up waiting on approval. The cards are boards'
  // data, read here because a route may reach any door and crm may not reach
  // boards.
  const followup = await followupPanelData({ id: meeting.id, companyId: meeting.companyId, attendees: meeting.attendees });
  const followupCards = await meetingCardsView(
    { companyId: meeting.companyId, aiProgramId: meeting.aiProgramId },
    followup.items.flatMap((i) => (i.taskId ? [i.taskId] : [])),
    surface,
  );

  const summaryHtml = meeting.aiSummary ? await renderPlanMarkdown(meeting.aiSummary) : null;

  return (
    <div className="admin-content">
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/admin/revenue/meetings">
          ← All client meetings
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Client Meetings"
        title={meeting.title || "Untitled meeting"}
        sub={meeting.meetingDate ? formatDate(meeting.meetingDate) : "Date not set"}
        action={<MeetingStatusBadges meeting={meeting} />}
      />

      <div className="admin-card admin-section-card">
        <div className="admin-cell-muted u-sm">
          <div>
            <strong>Client:</strong>{" "}
            {meeting.companyName ? (
              <Link href={`/admin/revenue/companies/${meeting.companyId}`}>{meeting.companyName}</Link>
            ) : (
              "—"
            )}
          </div>
          <div className="u-mt-1">
            <strong>Attendees:</strong> {meeting.attendees.length > 0 ? meeting.attendees.join(", ") : "—"}
          </div>
        </div>

        <div className="u-mt-4">
          <div className="admin-shelf-heading u-mb-2">Summary</div>
          {meeting.aiStatus === "pending" ? (
            <div className="admin-cell-muted">Generating the summary…</div>
          ) : meeting.aiStatus === "failed" ? (
            <div className="admin-cell-muted">
              Summary failed{meeting.aiError ? `: ${meeting.aiError}` : "."} Use “Retry summary” below.
            </div>
          ) : summaryHtml ? (
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
          ) : (
            <div className="admin-cell-muted">No summary.</div>
          )}
        </div>

        <details className="u-mt-4">
          <summary className="admin-cell-muted u-pointer">
            Full transcript{meeting.sourceFileName ? ` · ${meeting.sourceFileName}` : ""}
          </summary>
          <pre
            className="u-mt-2 u-prewrap u-break-all admin-scroll-md"
          >
            {meeting.transcript}
          </pre>
        </details>

        <MeetingControls
          id={meeting.id}
          published={!!meeting.publishedAt}
          aiStatus={meeting.aiStatus}
          redirectAfterDelete={`${surface}/revenue/meetings`}
          initial={{
            title: meeting.title ?? "",
            meetingDate: meeting.meetingDate ?? "",
            attendees: meeting.attendees.join(", "),
            summary: meeting.aiSummary ?? "",
          }}
        />
      </div>

      <MeetingProposalPanel
        meetingId={meeting.id}
        isSales={proposal.isSales}
        summaryReady={meeting.aiStatus === "ready"}
        run={proposal.run}
        may={mayProp(access, ["crm.calls"])}
      />

      <MeetingFollowupPanel
        meetingId={meeting.id}
        companyName={meeting.companyName}
        summaryReady={Boolean(meeting.aiSummary?.trim()) && meeting.aiStatus !== "pending" && meeting.aiStatus !== "failed"}
        data={followup}
        cards={followupCards}
        viewerPersonId={access.personId}
        may={mayProp(access, ["crm.calls"])}
        fileOnBoard={fileMeetingActionsOnBoard}
      />
    </div>
  );
}
