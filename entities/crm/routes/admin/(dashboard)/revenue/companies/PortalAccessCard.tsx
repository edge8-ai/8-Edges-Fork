import { Badge } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import type { PortalAccessRow } from "@/entities/crm/lib/portal";

// Who at the client can sign in to the portal, at a glance beside Details.
// Invites and revokes stay on the People & access tab, which owns the controls.
export function PortalAccessCard({ rows }: { rows: PortalAccessRow[] }) {
  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Portal access</h2>
      {rows.length === 0 ? (
        <p className="admin-cell-muted u-sm u-m-0">No one at this client can sign in yet.</p>
      ) : (
        <div className="admin-list">
          {rows.map((r) => (
            <div className="admin-list-row" key={r.personId}>
              <div className="admin-list-main">
                <div className="admin-list-title u-truncate">{r.name}</div>
                <div className="admin-list-sub">
                  {humanize(r.role)}
                  {r.accessStatus === "invited" && r.invitedAt ? ` · invited ${formatDate(r.invitedAt)}` : ""}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={r.accessStatus === "active" ? "ok" : "warn"}>
                  {r.accessStatus === "active" ? "Signed in" : "Invited"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="admin-cell-muted u-sm u-mt-4 u-mb-1">Invite or revoke people on the People &amp; access tab.</p>
    </div>
  );
}
