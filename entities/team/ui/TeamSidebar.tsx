"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "@/entities/team/lib/actions";
import { initials } from "@/kernel/ui/format";
import { isSubsection, makeIsActive, type NavGroup, type NavSection } from "@/kernel/shell/nav";
import { TeamNavEntries } from "./TeamNavEntries";

// Lighter sibling of AdminSidebar: reuses the admin shell CSS but drops the brand
// switcher and collapsible offices. Flat nav grouped My Work / Me / My Team / Company. Items
// without `enabled` render as muted "soon" placeholders (their slice has not shipped
// yet), mirroring the admin nav so the shell always looks complete without dead links.
//
// The rows themselves are no longer here. Each entity contributes them from its
// browser-safe door and app/nav.ts composes the ones this deployment installs
// (ADR 0002, RS-14); the layout keeps only the rows whose page the person may
// open (ADR 0013), and this component renders what it is handed.

// Mirror of AdminSidebar's VIEWS: Admin and Team are separate apps, the
// switcher navigates between them. "Admin" is only live for team members who
// may enter the Admin view: the layout passes whether they hold surface.admin.
type View = { key: string; label: string; ico: string; href: string; current?: boolean };
const VIEWS: View[] = [
  { key: "team", label: "Team", ico: "☷", href: "/team", current: true },
  { key: "admin", label: "Admin", ico: "◈", href: "/admin" },
];

export function TeamSidebar({
  sections,
  name,
  avatarUrl = null,
  isAdmin,
  search = null,
}: {
  // Composed by the composition root from the installed entities (app/nav.ts).
  sections: NavSection[];
  name: string;
  avatarUrl?: string | null;
  isAdmin: boolean;
  // The search palette's row (S.1), bound by the layout to the team search action.
  search?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  // Which row the address bar is on is not a question about the path alone: the
  // Workboard's Board, List and Calendar are one page told apart by `?view=`
  // (W.69). This sidebar used to compare the pathname against the whole href,
  // query included, so a row carrying one could never match and the query-less
  // Board row matched every one of them — on /team/workboard?view=calendar the
  // sidebar said Board (W.100). kernel/shell/nav's makeIsActive is the one
  // implementation of that rule, already used by the admin shell and tested
  // there; this component had a weaker copy of it, which is what rule 3 of
  // CLAUDE.md exists to prevent.
  const searchParams = useSearchParams();
  const [navOpen, setNavOpen] = useState(false);

  const groups: NavGroup[] = sections.flatMap((section) => section.groups);
  const isActive = makeIsActive(sections);

  // Groups start collapsed, except the one holding the page you are on (W.182,
  // from Derek's spark): every page load used to close all five, the current
  // one included, so the sidebar never said where you were. A group you open or
  // close yourself stays that way while you move around. The open group comes
  // from the URL, so the server and the browser draw the same sidebar.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const holdsCurrentPage = (g: NavGroup) =>
    g.items.some((e) =>
      isSubsection(e)
        ? e.items.some((i) => isActive(pathname, i.href, searchParams ?? undefined))
        : isActive(pathname, e.href, searchParams ?? undefined),
    );
  const isOpen = (g: NavGroup) => (g.label && g.label in toggled ? toggled[g.label] : holdsCurrentPage(g));

  function toggleGroup(g: NavGroup) {
    const key = g.label as string;
    const open = isOpen(g);
    setToggled((t) => ({ ...t, [key]: !open }));
  }
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const userInitials = initials(name);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProfileMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileMenuOpen]);

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
        <strong>Edge8 Team</strong>
      </div>

      {navOpen && <div className="admin-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`admin-sidebar${navOpen ? " is-open" : ""}`} aria-label="Team">
        <div className="admin-brand">
          <span className="admin-brand-lead">Edge8 Team</span>
          <span className="admin-brand-actions">
            <button
              type="button"
              className="admin-avatarbtn"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Switch view"
              onClick={() => setProfileMenuOpen((v) => !v)}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                <img src={avatarUrl} alt="" />
              ) : (
                userInitials
              )}
            </button>
          </span>
        </div>

        {profileMenuOpen && (
          <div className="admin-profilemenu-backdrop" onClick={() => setProfileMenuOpen(false)} />
        )}
        {profileMenuOpen && (
          <div className="admin-profilemenu" role="menu" aria-label="Switch view">
            <div className="admin-profilemenu-head">
              <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded file of unknown size; next/image needs fixed dimensions
                  <img src={avatarUrl} alt="" />
                ) : (
                  userInitials
                )}
              </span>
              <span className="admin-profilemenu-email">{name}</span>
            </div>

            <div className="admin-profilemenu-label">Switch view</div>
            {VIEWS.map((v) => {
              if (v.current) {
                return (
                  <span key={v.key} className="admin-profilemenu-item" role="menuitem" aria-current="true">
                    <span className="admin-profilemenu-ico" aria-hidden>
                      {v.ico}
                    </span>
                    {v.label}
                    <span className="admin-profilemenu-here">Current</span>
                  </span>
                );
              }
              const live = v.key === "admin" ? isAdmin : false;
              if (live) {
                return (
                  <Link
                    key={v.key}
                    href={v.href}
                    className="admin-profilemenu-item"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <span className="admin-profilemenu-ico" aria-hidden>
                      {v.ico}
                    </span>
                    {v.label}
                  </Link>
                );
              }
              return (
                <span
                  key={v.key}
                  className="admin-profilemenu-item is-disabled"
                  role="menuitem"
                  aria-disabled
                  title="Not an admin"
                >
                  <span className="admin-profilemenu-ico" aria-hidden>
                    {v.ico}
                  </span>
                  {v.label}
                  <span className="admin-nav-badge">n/a</span>
                </span>
              );
            })}

            <div className="admin-profilemenu-sep" />

            <form action={signOut}>
              <button type="submit" className="admin-signout admin-profilemenu-signout">
                Sign out
              </button>
            </form>
          </div>
        )}

        {search}

        <div className="admin-nav" onClick={() => setNavOpen(false)}>
          {groups.map((group, gi) => {
            const isCollapsed = Boolean(group.label) && !isOpen(group);
            return (
            <div className="admin-nav-group" key={group.label ?? `g${gi}`}>
              {group.label && (
                <button
                  className="admin-nav-grouplabel admin-nav-grouptoggle"
                  aria-expanded={!isCollapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(group);
                  }}
                >
                  {group.label}
                  <span className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <TeamNavEntries entries={group.items} groupLabel={group.label} isActive={(href) => isActive(pathname, href, searchParams ?? undefined)} />
              )}
            </div>
            );
          })}
        </div>

      </nav>
    </>
  );
}
