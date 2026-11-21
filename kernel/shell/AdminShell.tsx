// The Admin surface's shell: the frame every admin page renders inside (ADR
// 0002). It owns the layout and the sidebar chrome and names no entity — the
// navigation, the sign-out action and the assistant widget are handed to it by
// the composition root, which is the only place that knows which entities this
// deployment installs. So is the search palette: the layout binds it to the
// generated search action (S.1).
import type { ReactNode } from "react";
import { AdminSidebar } from "./AdminSidebar";
import type { NavSection } from "./nav";

export function AdminShell({
  sections,
  signOut,
  user,
  name,
  avatarUrl,
  canSwitchToTeam,
  initialFolded = false,
  assistant,
  search,
  inboxHref,
  clientHubHref = null,
  profileHref = null,
  children,
}: {
  sections: NavSection[];
  signOut: () => void | Promise<void>;
  user: { email: string };
  /** How the signed-in person is named on the account row; the address is its second line. */
  name: string;
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  /** Whether the sidebar is folded, from its cookie (./sidebar-fold). */
  initialFolded?: boolean;
  /** The chat widget, rendered by whichever entity owns the assistant. */
  assistant: ReactNode;
  /** The search palette's sidebar row, bound to this surface's search action. */
  search: ReactNode;
  /** Where the envelope leads, from the entity that owns the inbox; null draws none. */
  inboxHref: string | null;
  /** Where the account menu's Client Hub leads, or null where this person may not open it. */
  clientHubHref?: string | null;
  /** The signed-in person's own profile, or null for an admin with no team identity. */
  profileHref?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <AdminSidebar
        sections={sections}
        signOut={signOut}
        user={user}
        name={name}
        avatarUrl={avatarUrl}
        canSwitchToTeam={canSwitchToTeam}
        initialFolded={initialFolded}
        search={search}
        inboxHref={inboxHref}
        clientHubHref={clientHubHref}
        profileHref={profileHref}
      />
      <main className="admin-main">{children}</main>
      {assistant}
    </div>
  );
}
