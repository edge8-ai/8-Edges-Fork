import { Badge } from "@/kernel/ui/Badge";
import type { HubTeam } from "../lib/directory-shapes";

// Client Hub team tab: both sides of the account, the Edge8 staff assigned to
// the client (client-visible assignments only) and the client's own people.
// Shared across the team hub, the admin 360 hub, and the portal.
export function HubTeamPanel({ team }: { team: HubTeam }) {
  return (
    <div className="u-stack u-gap-4">
      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Edge8 team</h2>
        {team.edge8.length === 0 ? (
          <div className="admin-empty">No staff assigned yet.</div>
        ) : (
          <div className="admin-list">
            {team.edge8.map((m, i) => (
              <div className="admin-list-row" key={`${m.name}-${i}`}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{m.name}</div>
                </div>
                {m.roleTitle && (
                  <div className="admin-list-aside">
                    <Badge tone="info">{m.roleTitle}</Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card">
        <h2 className="admin-card-title u-mb-3">Client contacts</h2>
        {team.client.length === 0 ? (
          <div className="admin-empty">No contacts linked yet.</div>
        ) : (
          <div className="admin-list">
            {team.client.map((m, i) => (
              <div className="admin-list-row" key={`${m.name}-${i}`}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{m.name}</div>
                </div>
                {m.title && (
                  <div className="admin-list-aside">
                    <Badge tone="neutral">{m.title}</Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
