"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// The Admin surface's sidebar: the shell's chrome, rendering whatever
// navigation the composition root hands it (ADR 0002). It owns no rows of its
// own — the information architecture is kernel/shell/admin-ia.ts and the rows
// come from the installed entities' contributions, composed in app/nav.ts — and
// it names no entity, which is what lets it live in the kernel.
//
// `enabled: false` items render muted with a "soon" tag and are not navigable,
// so the shell looks complete before a route exists. The Admin layout hands
// over only the rows the viewer may open (ADR 0013).
//
// Drawn by ./RailSidebar, as the Team sidebar is: one column that folds to
// icons, with the account row at its foot, whose menu switches app (TH.29).
import { openSearchPalette } from "@/kernel/ui/search-palette-model";
import { ADMIN_GROUP_ICONS } from "./admin-ia";
import { AdminNav } from "./AdminNav";
import { appViews } from "./app-views";
import { makeIsActive, type NavSection } from "./nav";
import { RailSidebar } from "./RailSidebar";

// When the person has no name on record the row shows the address, and the
// monogram comes from its local part:
// "jane.doe@…" -> "JD", "jane@…" -> "JA".
function initials(email: string): string {
  const local = (email.split("@")[0] || email).trim();
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return raw.toUpperCase();
}

export function AdminSidebar({
  sections,
  signOut,
  user,
  name,
  avatarUrl,
  canSwitchToTeam,
  initialFolded = false,
  search,
  inboxHref,
  clientHubHref = null,
  profileHref = null,
}: {
  sections: NavSection[];
  // The sign-out action belongs to whichever entity owns the admin session, so
  // the shell takes it rather than importing one (the kernel may name no
  // entity, and a server action cannot cross into a client component any other
  // way).
  signOut: () => void | Promise<void>;
  user: { email: string };
  name: string;
  avatarUrl: string | null;
  canSwitchToTeam: boolean;
  // Whether the sidebar is folded, read by the layout from its cookie
  // (./sidebar-fold).
  initialFolded?: boolean;
  // The search palette's row (S.1), handed in by the layout for the same reason
  // as signOut: its action is generated in app/, which the kernel cannot import.
  search: ReactNode;
  // The inbox's address (S.3), from the generated app/shell.ts: the kernel may
  // not name the entity that owns it, and a deployment without one draws no envelope.
  inboxHref: string | null;
  // Where the account menu's Client Hub leads (TH.29), from the generated
  // app/shell.ts and this person's access; null leaves it out of the menu.
  clientHubHref?: string | null;
  // The person's own profile, which lives on the Team surface; null for an
  // admin with no team identity.
  profileHref?: string | null;
}) {
  const [navOpen, setNavOpen] = useState(false);
  // Any change of page closes the phone menu (M2.14). The nav rows close it
  // themselves, but a search result picked from inside the menu navigated with
  // the menu and its dark overlay still over the new page. Reset while
  // rendering, the way React documents for state that follows a value.
  const pathname = usePathname() ?? "";
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setNavOpen(false);
  }
  // The folded panel lights the icon of the row, or group, the page is on, by
  // the same rule AdminNav lights the open tree's row.
  const searchParams = useSearchParams();
  const isActive = makeIsActive(sections);
  const here = (href: string) => isActive(pathname, href, searchParams ?? undefined);
  const closeNav = () => setNavOpen(false);

  return (
    <>
      <div className="admin-mobilebar">
        <button
          className="admin-mobile-toggle"
          aria-label="Open navigation"
          onClick={() => setNavOpen(true)}
        >
          ☰
        </button>
        <strong>8 Edges</strong>
      </div>

      {navOpen && (
        <div className="admin-scrim" onClick={closeNav} />
      )}

      <RailSidebar
        label="Admin"
        views={appViews("admin", { team: canSwitchToTeam, client: clientHubHref })}
        name={name}
        email={user.email}
        profileHref={profileHref}
        monogram={name === user.email ? initials(user.email) : undefined}
        avatarUrl={avatarUrl}
        signOut={signOut}
        actions={
          inboxHref && (
            <a className="admin-iconbtn" href={inboxHref} aria-label="Inbox" title="Inbox">
              ✉
            </a>
          )
        }
        search={search}
        onSearch={openSearchPalette}
        groups={sections.flatMap((s) => s.groups)}
        groupIcons={ADMIN_GROUP_ICONS}
        here={here}
        initialFolded={initialFolded}
        navOpen={navOpen}
        closeNav={closeNav}
      >
        <AdminNav sections={sections} onNavigate={closeNav} />
      </RailSidebar>
    </>
  );
}
