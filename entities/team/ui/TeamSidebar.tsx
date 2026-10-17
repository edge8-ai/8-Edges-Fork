"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isSubsection, makeIsActive, type NavGroup, type NavItem, type NavSection } from "@/kernel/shell/nav";
import { TeamMobileBar } from "./TeamMobileBar";
import { TeamNavEntries } from "./TeamNavEntries";
import { TeamProfileMenu } from "./TeamProfileMenu";
import { rememberGroup, useOpenGroups } from "./team-nav-memory";

// Lighter sibling of AdminSidebar: reuses the admin shell CSS but drops the brand
// switcher and collapsible offices. Flat nav grouped My Work / Me / My Team / Company. Items
// without `enabled` render as muted "soon" placeholders (their slice has not shipped
// yet), mirroring the admin nav so the shell always looks complete without dead links.
//
// The rows themselves are no longer here. Each entity contributes them from its
// browser-safe door and app/nav.ts composes the ones this deployment installs
// (ADR 0002, RS-14); the layout keeps only the rows whose page the person may
// open (ADR 0013), and this component renders what it is handed.

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
  // Any change of page closes the drawer (M2.14). The rows close it
  // themselves, but a search result picked from inside the drawer navigated
  // with the drawer and its dark overlay still over the new page. Reset while
  // rendering, the way React documents for state that follows a value.
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setNavOpen(false);
  }

  const groups: NavGroup[] = sections.flatMap((section) => section.groups);
  const isActive = makeIsActive(sections);

  // Groups start collapsed, except the one holding the page you are on (W.182,
  // from Derek's spark): every page load used to close all five, the current
  // one included, so the sidebar never said where you were. A group or a
  // Revenue subsection you open or close yourself stays that way, and since
  // TH.5 it is remembered in this browser, so a reload no longer forgets it.
  // The first render uses the URL alone, so the server and the browser draw the
  // same sidebar; what was remembered is applied right after (team-nav-memory).
  const toggled = useOpenGroups();
  const here = (href: string) => isActive(pathname, href, searchParams ?? undefined);
  const holdsCurrentPage = (g: NavGroup) =>
    g.items.some((e) => (isSubsection(e) ? e.items.some((i) => here(i.href)) : here(e.href)));
  const isOpen = (g: NavGroup) => (g.label && g.label in toggled ? toggled[g.label] : holdsCurrentPage(g));

  // The phone bar names the page by the row it is on; a page no row points at
  // (a card, a person, a meeting) leaves the bar with the hub's name.
  const current: NavItem | undefined = groups
    .flatMap((g) => g.items.flatMap((e) => (isSubsection(e) ? e.items : [e])))
    .find((i) => here(i.href));

  // The drawer is a phone layout: below 880px (admin.css) the sidebar slides in
  // over the page. Widening the window past that left navOpen true, so the
  // drawer and its scrim were still open when the window narrowed again, over a
  // page the person had moved on from (TH.7.2). Crossing the breakpoint closes it.
  useEffect(() => {
    if (!navOpen) return;
    const wide = window.matchMedia("(min-width: 881px)");
    const onChange = (e: MediaQueryListEvent) => e.matches && setNavOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [navOpen]);

  // Escape closes the drawer, as it closes every other layer on the hub.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <>
      <TeamMobileBar title={current?.label ?? null} onOpenNav={() => setNavOpen(true)} />

      {navOpen && <div className="admin-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`admin-sidebar${navOpen ? " is-open" : ""}`} aria-label="Team">
        <TeamProfileMenu name={name} avatarUrl={avatarUrl} isAdmin={isAdmin} />

        {/* A server-built slot whose chunk is still loading arrives as a lazy and
            escapes the fixed-children key check; the keyed Fragment gives it a key. */}
        <Fragment key="search">{search}</Fragment>

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
                    rememberGroup(group.label as string, isCollapsed);
                  }}
                >
                  {group.label}
                  <span className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden>
                    ▾
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <TeamNavEntries
                  entries={group.items}
                  groupLabel={group.label}
                  isActive={here}
                  isSubOpen={(key) => toggled[key] ?? false}
                  setSubOpen={rememberGroup}
                />
              )}
            </div>
            );
          })}
        </div>

      </nav>
    </>
  );
}
