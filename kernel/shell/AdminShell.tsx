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
  avatarUrl,
  canSwitchToTeam,
  assistant,
  search,
  inboxHref,
  children,
}: {
  sections: NavSection[];
  signOut: () => void | Promise<void>;
  user: { email: string };
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  /** The chat widget, rendered by whichever entity owns the assistant. */
  assistant: ReactNode;
  /** The search palette's sidebar row, bound to this surface's search action. */
  search: ReactNode;
  /** Where the envelope leads, from the entity that owns the inbox; null draws none. */
  inboxHref: string | null;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell">
      <AdminSidebar
        sections={sections}
        signOut={signOut}
        user={user}
        avatarUrl={avatarUrl}
        canSwitchToTeam={canSwitchToTeam}
        search={search}
        inboxHref={inboxHref}
      />
      <main className="admin-main">{children}</main>
      {assistant}
    </div>
  );
}
