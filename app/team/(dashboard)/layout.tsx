// The team hub's composition root. Like the Admin layout this is not a mount:
// the navigation is generated from this deployment's entity list (ADR 0002), so
// app/ is the only place it can be named. It guards the surface, keeps the
// rows the person may open, and renders the shell.
//
// The surface is entered by its atom (ADR 0014). The team actor is resolved
// first because every team page reads it, and someone with no team identity
// who holds surface.admin is sent to the Admin view rather than refused.
import type { Metadata } from "next";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { RefreshOnStale } from "@/kernel/shell/RefreshOnStale";
import { SearchPalette } from "@/kernel/ui/SearchPalette";
import { TeamSidebar, TeamChatWidget } from "@/entities/team";
import { TEAM_NAV } from "@/app/nav";
import { PERMISSIONS } from "@/app/permissions";
import { requirePermission } from "@/kernel/identity/access-request";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { keepRows } from "@/kernel/shell/nav";
import { searchTeam } from "@/app/search";
import "@/app/admin/admin.css";
import "@/app/admin/search-palette.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · Edge8 Team", default: "Edge8 Team" },
  description: "Your Edge8 team workspace.",
  robots: { index: false, follow: false },
};

export default async function TeamDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTeamMember();
  const access = await requirePermission("surface.team");
  // A row is shown only to someone who may open the page it links to (ADR 0013),
  // so a role that loses a permission loses the row with it, and no entity
  // decides another's visibility (AC.8). A row for a page no declaration names
  // is kept: check:access fails such a page, so there is none.
  const sections = keepRows(TEAM_NAV, (item) => {
    const permission = permissionForPath(PERMISSIONS.routes, item.href);
    return permission === null || permission === "public" || access.may(permission);
  });

  return (
    <div className="admin-shell">
      <RefreshOnStale />
      <TeamSidebar
        sections={sections}
        name={actor.displayName}
        avatarUrl={actor.avatarUrl}
        isAdmin={access.may("surface.admin")}
        search={<SearchPalette search={searchTeam} />}
      />
      <main className="admin-main">{children}</main>
      <TeamChatWidget />
    </div>
  );
}
