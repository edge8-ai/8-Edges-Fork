// The Admin surface's composition root. Unlike every other file under app/ this
// is not a mount: the shell is the kernel's (ADR 0002) and the navigation is
// generated from this deployment's entity list, so app/ is the only place both
// can be named. It guards the surface, then hands the shell what it needs.
//
// The surface is entered by its atom (ADR 0014): whoever holds surface.admin,
// through the Admin role or any role a Super Admin composes with it, enters.
import type { Metadata } from "next";
import { requirePermission } from "@/kernel/identity/access-request";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { keepRows } from "@/kernel/shell/nav";
import { hasTeamAccess } from "@/kernel/identity/team-auth";
import { AdminShell } from "@/kernel/shell/AdminShell";
import { RefreshOnStale } from "@/kernel/shell/RefreshOnStale";
import { SearchPalette } from "@/kernel/ui/SearchPalette";
import { signOut } from "@/entities/company-os";
import { ADMIN_NAV } from "@/app/nav";
import { PERMISSIONS } from "@/app/permissions";
import { searchAdmin } from "@/app/search";
// What the shell takes from optional entities arrives through the generated
// module: the assistant pane and the avatar resolver are provided when their
// entities are installed and fall back otherwise, so this file never names them.
import { AdminAssistant, avatarUrlForAuthUser, INBOX_HREF } from "@/app/shell";
import "@/app/admin/admin.css";
import "@/app/admin/search-palette.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · 8 Edges", default: "8 Edges" },
  description: "Edge8 Company OS — the internal admin for contacts, revenue, talent, and operations.",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const access = await requirePermission("surface.admin");
  const { user } = access;
  const [canSwitchToTeam, avatarUrl] = await Promise.all([hasTeamAccess(user.id), avatarUrlForAuthUser(user.id)]);
  // A row is shown only to someone who may open the page it links to (ADR 0013,
  // AC.11): the ATS, Agents and Roles & grants follow their pages' permissions,
  // not a flag on the row. A row with no page yet (a "soon" row) is kept.
  const sections = keepRows(ADMIN_NAV, (item) => {
    const permission = permissionForPath(PERMISSIONS.routes, item.href);
    return permission === null || permission === "public" || access.may(permission);
  });

  return (
    <AdminShell
      sections={sections}
      signOut={signOut}
      user={user}
      avatarUrl={avatarUrl}
      canSwitchToTeam={canSwitchToTeam}
      // The assistant is its own atom, so a role opened for one job does not carry it.
      assistant={AdminAssistant && access.may("assistant.query") ? <AdminAssistant email={user.email} /> : null}
      search={<SearchPalette search={searchAdmin} />}
      inboxHref={INBOX_HREF}
    >
      <RefreshOnStale />
      {children}
    </AdminShell>
  );
}
