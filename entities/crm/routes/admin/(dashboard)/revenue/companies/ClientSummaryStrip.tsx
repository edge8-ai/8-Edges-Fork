import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { formatDate } from "@/kernel/ui/format";
import { clientTerm, clientTermLabel, todayInCompanyZone } from "@/entities/crm/lib/client-term";
import type { PortalAccessRow } from "@/entities/crm/lib/portal";

// The client's standing in one row above the Internal tabs, at the size of the
// Details rows: when the relationship started and ends, where today falls in
// it, and how many of the client's contacts can sign in, with a link to the
// People & access tab where access is granted.
export function ClientSummaryStrip({
  startDate,
  endDate,
  portalAccess,
  contactCount,
  peopleHref,
}: {
  startDate: string | null;
  endDate: string | null;
  portalAccess: PortalAccessRow[];
  contactCount: number;
  peopleHref: string;
}) {
  const notSignedIn = portalAccess.filter((r) => r.accessStatus === "invited").length;
  return (
    <div className="admin-card admin-section-card u-grid-4">
      <div>
        <div className="admin-cell-muted u-sm">Client since</div>
        <div className="admin-cell-strong">{formatDate(startDate)}</div>
      </div>
      <div>
        <div className="admin-cell-muted u-sm">Ends</div>
        <div className="admin-cell-strong">{endDate ? formatDate(endDate) : "Open-ended"}</div>
      </div>
      <div>
        <div className="admin-cell-muted u-sm">Status</div>
        <div className="admin-cell-strong">{clientTermLabel(clientTerm(startDate, endDate, todayInCompanyZone()))}</div>
      </div>
      <div>
        <div className="admin-cell-muted u-sm">Portal access</div>
        <div className="admin-cell-strong">
          {portalAccess.length} of {contactCount} contacts{" "}
          <Link href={peopleHref} className="u-sm">Manage</Link>
        </div>
        {notSignedIn > 0 && <div className="admin-kpi-note admin-kpi-note--warn">{notSignedIn} not signed in yet</div>}
      </div>
    </div>
  );
}
