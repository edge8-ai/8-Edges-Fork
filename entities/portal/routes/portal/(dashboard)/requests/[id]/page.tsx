import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { isPortalAdmin } from "@/entities/portal/lib/roles";
import { getWorkRequestForActor } from "@/entities/portal/lib/client-work-requests";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize, timeAgo } from "@/kernel/ui/format";
import {
  WORK_REQUEST_STATUS_LABEL,
  workRequestTone,
  formatHours,
  type WorkRequestStatus,
} from "@/entities/company-os";
import { DecisionPanel } from "./DecisionPanel";
import { ExternalLink } from "@/kernel/ui/ExternalLink";

export const metadata = {
  title: "Project Request",
  description: "Review your project request.",
};

// Client-friendly timeline labels (the raw event types are workflow-speak).
const EVENT_LABEL: Record<string, string> = {
  created: "Request sent",
  estimate_submitted: "Estimate received",
  estimate_resubmitted: "Updated estimate received",
  approved: "Estimate approved",
  rejected: "Request declined",
  info_requested: "Changes requested",
  scope_added: "You added scope",
  work_submitted: "Work delivered",
  accepted: "Work accepted",
  message: "Update",
  cancelled: "Cancelled",
};

export default async function PortalRequestDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await requirePortalPermission("surface.portal");
  const data = await getWorkRequestForActor(actor, params.id);
  if (!data) notFound();
  const { request: r, events } = data;
  const status = r.status as WorkRequestStatus;
  // Estimate/work decisions are admin-only (PR 2 roles); the server re-checks.
  const canDecide = r.clientCompanyId ? isPortalAdmin(actor, r.clientCompanyId) : false;

  return (
    <>
      <PageHead
        eyebrow="Client Portal · Requests"
        title={r.title}
        sub={`${r.contractorName ?? "Contractor"} · requested ${formatDate(r.createdAt)}`}
        action={<Badge tone={workRequestTone(status)}>{WORK_REQUEST_STATUS_LABEL[status] ?? humanize(status)}</Badge>}
      />

      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">Brief</h2>
        <div className="u-prewrap">{r.brief}</div>
      </div>

      {r.estimatedHours !== null && (
        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-3">
            Estimate — {formatHours(r.estimatedHours)}
          </h2>
          {r.planText && <div className="u-prewrap">{r.planText}</div>}
          {r.estimateSubmittedAt && (
            <div className="admin-cell-muted u-mt-2 u-sm">
              Submitted {timeAgo(r.estimateSubmittedAt)}
            </div>
          )}
        </div>
      )}

      {r.workSubmittedAt && (
        <div className="admin-card admin-section-card u-mb-4">
          <h2 className="admin-card-title u-mb-3">
            Delivered work — {formatHours(r.actualHours)}
            {Number(r.actualOvertimeHours) > 0 && ` (+ ${formatHours(r.actualOvertimeHours)} overtime)`}
          </h2>
          {r.workSummary && <div className="u-prewrap">{r.workSummary}</div>}
          {r.workLink && (
            <p className="u-mt-2 u-mb-0">
              <ExternalLink href={r.workLink} fallback={r.workLink}>
                View the result
              </ExternalLink>
            </p>
          )}
          <div className="admin-cell-muted u-mt-2 u-sm">
            Delivered {timeAgo(r.workSubmittedAt)}
          </div>
        </div>
      )}

      {canDecide && <DecisionPanel id={r.id} status={status} />}

      <div className="admin-card admin-section-card u-mt-4">
        <h2 className="admin-card-title u-mb-3">Timeline</h2>
        {events.length === 0 ? (
          <div className="admin-empty">No activity yet.</div>
        ) : (
          <div className="u-stack u-gap-3">
            {events.map((e) => (
              <div key={e.id}>
                <div className="u-row">
                  <strong>{EVENT_LABEL[e.type] ?? humanize(e.type)}</strong>
                  <span className="admin-cell-muted">
                    {e.actorType === "client" ? "You" : e.actorType === "contractor" ? r.contractorName ?? "Contractor" : "Edge8"} ·{" "}
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
                {e.body && <div className="u-mt-1 u-prewrap">{e.body}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
