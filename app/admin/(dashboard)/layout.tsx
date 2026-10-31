// The Admin surface's composition root. Unlike every other file under app/ this
// is not a mount: the shell is the kernel's (ADR 0002) and the navigation is
// generated from this deployment's entity list, so app/ is the only place both
// can be named. It guards the surface, then hands the shell what it needs.
//
// The surface is entered by its atom (ADR 0014): whoever holds surface.admin,
// through the Admin role or any role a Super Admin composes with it, enters.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { requirePermission } from "@/kernel/identity/access-request";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { displayNameOfAuthUser } from "@/kernel/identity/display-name";
import { mayOpen } from "@/kernel/identity/may-open";
import { keepRows } from "@/kernel/shell/nav";
import { hasTeamAccess } from "@/kernel/identity/team-auth";
import { AdminShell } from "@/kernel/shell/AdminShell";
import { RefreshOnStale } from "@/kernel/shell/RefreshOnStale";
import { isSidebarFolded, SIDEBAR_FOLD_COOKIE } from "@/kernel/shell/sidebar-fold";
import { SearchPalette } from "@/kernel/ui/SearchPalette";
import { signOut } from "@/entities/company-os";
import { ADMIN_NAV } from "@/app/nav";
import { PERMISSIONS } from "@/app/permissions";
// What the shell takes from optional entities arrives through the generated
// module: the assistant pane and the avatar resolver are provided when their
// entities are installed and fall back otherwise, so this file never names them.
import { AdminAssistant, avatarUrlForAuthUser, CLIENT_HUB_HREF, INBOX_HREF, PROFILE_HREF } from "@/app/shell";
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
  const [canSwitchToTeam, avatarUrl, displayName] = await Promise.all([
    hasTeamAccess(user.id),
    avatarUrlForAuthUser(user.id),
    // The account row names the person as Team does (TH.29), not by the
    // sign-in address alone; the address stays as its second line. By the
    // sign-in, like the face beside it, so an assume never mislabels the row.
    displayNameOfAuthUser(user.id, user.email),
  ]);
  // A row is shown only to someone who may open the page it links to (ADR 0013,
  // AC.11): the ATS, Agents and Roles & grants follow their pages' permissions,
  // not a flag on the row. A row with no page yet (a "soon" row) is kept.
  const sections = keepRows(ADMIN_NAV, (item) => {
    const permission = permissionForPath(PERMISSIONS.routes, item.href);
    return permission === null || permission === "public" || access.may(permission);
  });
  // The account menu offers the Client Hub (TH.29) only to whoever may open
  // the list of clients it leads to. A link, so it is asked the way every link
  // is (mayOpen): an address no page declares is refused.
  const clientHubHref = mayOpen(access, CLIENT_HUB_HREF) ? CLIENT_HUB_HREF : null;

  return (
    <AdminShell
      sections={sections}
      signOut={signOut}
      user={user}
      name={displayName}
      avatarUrl={avatarUrl}
      canSwitchToTeam={canSwitchToTeam}
      // Folded or open, as this person last left it in either app.
      initialFolded={isSidebarFolded((await cookies()).get(SIDEBAR_FOLD_COOKIE)?.value)}
      // The assistant is its own atom, so a role opened for one job does not carry it.
      assistant={AdminAssistant && access.may("assistant.query") ? <AdminAssistant email={user.email} /> : null}
      search={<SearchPalette surface="admin" />}
      inboxHref={INBOX_HREF}
      clientHubHref={clientHubHref}
      // An admin's own profile is a Team page, so only one who may enter Team has one.
      profileHref={canSwitchToTeam ? PROFILE_HREF : null}
    >
      <RefreshOnStale />
      {children}
    </AdminShell>
  );
}
