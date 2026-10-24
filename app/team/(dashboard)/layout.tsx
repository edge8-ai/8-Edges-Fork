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
import { TeamAssumeBanner, TeamSidebar, TeamChatWidget, TEAM_APP_METADATA } from "@/entities/team";
import { TEAM_NAV } from "@/app/nav";
import { PERMISSIONS } from "@/app/permissions";
import { requirePermission } from "@/kernel/identity/access-request";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { keepRows } from "@/kernel/shell/nav";
import { wornTiersFor } from "@/kernel/shell/faces";
import { RankUpGate, teamNavCounts } from "@/app/shell";
import "@/app/admin/admin.css";
import "@/app/admin/search-palette.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · Edge8 Team", default: "Edge8 Team" },
  description: "Your Edge8 team workspace.",
  robots: { index: false, follow: false },
  ...TEAM_APP_METADATA,
};

export default async function TeamDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireTeamMember();
  // What waits on the person, counted on its row (TH.8): asks from teammates on
  // the Inbox. Read beside the guard, and tolerant, so it never holds a page up.
  // The reader's own face in the sidebar wears the border they chose to show
  // (LD.4), asked once of the kernel's faces seam, which answers nothing when
  // their game style is off or the deployment has no ladders, and never fails
  // the page over a cosmetic.
  const [access, counts, worn] = await Promise.all([requirePermission("surface.team"), teamNavCounts(actor.personId), wornTiersFor([actor.personId], { personId: actor.personId })]);
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
        counts={counts}
        isAdmin={access.may("surface.admin")}
        search={<SearchPalette surface="team" />}
        assistant={!actor.impersonation}
        border={worn.get(actor.personId)?.learnShare ?? null}
      />
      <main className="admin-main">
        {actor.impersonation && <TeamAssumeBanner impersonation={actor.impersonation} viewingAsName={actor.displayName} />}
        {children}
      </main>
      {/* The assistant answers as whoever is signed in, which while assuming is
          the admin, not the person being viewed, so it stays out of the view. */}
      {!actor.impersonation && <TeamChatWidget />}
      {/* The reader's own rank-up, when an act lifted them into a new tier
          (LD.5): full screen over whichever team page they are on, for them
          alone. Nothing when the deployment has no ladders. */}
      {RankUpGate && <RankUpGate />}
    </div>
  );
}
