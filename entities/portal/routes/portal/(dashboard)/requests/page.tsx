import Link from "next/link";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { contributorCompanyScope } from "@/entities/portal/lib/roles";
import {
  listPortalInquiriesForActor,
  listWorkRequestsForActor,
} from "@/entities/portal/lib/client-work-requests";
import { getTokenBalance } from "@/entities/portal/lib/tokens";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import {
  WORK_REQUEST_STATUS_LABEL,
  workRequestTone,
  formatHours,
  type WorkRequestStatus,
} from "@/entities/company-os";
import { GeneralRequest } from "./GeneralRequest";

export const metadata = {
  title: "Requests",
  description: "Request work from your Edge8 team.",
};

// Statuses waiting on the CLIENT float a call-to-action.
const NEEDS_CLIENT = ["estimate_submitted", "work_submitted"];

export default async function PortalRequestsPage() {
  const actor = await requirePortalPermission("surface.portal");
  // Viewers are read-only (PR 2 roles): they see their company's requests but
  // get no "start a request" actions. The server actions re-check anyway.
  const canCreate = contributorCompanyScope(actor).length > 0;
  const [requests, inquiries, tokens] = await Promise.all([
    listWorkRequestsForActor(actor),
    listPortalInquiriesForActor(actor),
    getTokenBalance(actor),
  ]);

  return (
    <div className="admin-content">
      <PageHead
        eyebrow="Client Portal"
        title="Requests"
        sub="Five ways to get work moving: ask us anything, brief a contractor directly, hire a full-time team member in Vietnam, top up human tokens, or plan an AI program."
      />

      {canCreate && (<>
      <h2 className="admin-section-label u-mt-0">Start a request</h2>
      <div className="admin-kpi-grid admin-kpi-grid--2up u-mb-5 u-rows-equal">
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">General request</h2>
          <p className="admin-page-sub u-m-0 u-minh-40">
            Not sure who you need? Describe it and the Edge8 team will pick it up.
          </p>
          <div className="u-mt-auto u-pt-4">
            <GeneralRequest />
          </div>
        </div>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Project for a contractor</h2>
          <p className="admin-page-sub u-m-0 u-minh-40">
            Brief a contractor directly. They estimate the hours, you approve, work starts.
          </p>
          <div className="u-mt-auto u-pt-4">
            <Link href="/portal/requests/new" className="admin-btn admin-btn--primary">
              New project request
            </Link>
          </div>
        </div>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Human tokens</h2>
          <p className="admin-page-sub u-m-0 u-minh-40">
            {tokens.balanceTokens > 0
              ? `You have ${tokens.balanceTokens} tokens (1 token = 1 hour of skilled work).`
              : "Pre-buy packs of skilled hours: 40 tokens per pack, $2,000."}
          </p>
          <div className="u-mt-auto u-pt-4">
            <Link href="/portal/tokens" className="admin-btn admin-btn--primary">
              {tokens.balanceTokens > 0 ? "View & buy tokens" : "Buy token packs"}
            </Link>
          </div>
        </div>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Build Your Team</h2>
          <p className="admin-page-sub u-m-0 u-minh-40">
            Hire dedicated full-time team members in Vietnam. 10% off for teams of 3 or more.
          </p>
          <div className="u-mt-auto u-pt-4">
            <Link href="/portal/requests/hire" className="admin-btn admin-btn--primary">
              Build your team
            </Link>
          </div>
        </div>
        <div className="admin-card admin-section-card u-stack">
          <h2 className="admin-card-title u-mb-2">Add AI Program Plan</h2>
          <p className="admin-page-sub u-m-0 u-minh-40">
            Plan an AI program: upload your documents, or build a 5Ds AI Program Brief with our guided assistant.
          </p>
          <div className="u-mt-auto u-pt-4">
            <Link href="/portal/programs/add" className="admin-btn admin-btn--primary">
              Add AI Program Plan
            </Link>
          </div>
        </div>
      </div>
      </>)}

      <h2 className="admin-section-label">Your requests</h2>
      <div className="admin-card admin-section-card u-mb-4">
        <h2 className="admin-card-title u-mb-3">Project requests</h2>
        {requests.length === 0 ? (
          <div className="admin-empty">No project requests yet.</div>
        ) : (
          <div className="admin-list">
            {requests.map((r) => (
              <Link
                key={r.id}
                href={`/portal/requests/${r.id}`}
                className="admin-list-row u-link-plain"
              >
                <div className="admin-list-main">
                  <div className="admin-list-title">{r.title}</div>
                  <div className="admin-list-sub">
                    {r.contractorName ?? "Contractor"} · {formatDate(r.createdAt)}
                    {r.estimatedHours !== null && ` · est ${formatHours(r.estimatedHours)}`}
                    {r.actualHours !== null && ` · delivered ${formatHours(r.actualHours)}`}
                  </div>
                </div>
                <div className="admin-list-aside u-items-end">
                  {NEEDS_CLIENT.includes(r.status) && <Badge tone="warn">Your review needed</Badge>}
                  <Badge tone={workRequestTone(r.status)}>
                    {WORK_REQUEST_STATUS_LABEL[r.status as WorkRequestStatus] ?? humanize(r.status)}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {inquiries.length > 0 && (
        <div className="admin-card admin-section-card">
          <h2 className="admin-card-title u-mb-3">Recent general requests</h2>
          <div className="admin-list">
            {inquiries.map((i) => (
              <div className="admin-list-row" key={i.id}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{i.subject || "General request"}</div>
                  <div className="admin-list-sub">{formatDate(i.createdAt)}</div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={statusTone(i.status)}>{i.status === "new_lead" ? "Received" : humanize(i.status)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
