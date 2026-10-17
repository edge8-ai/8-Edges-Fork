"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, endAssumeSession } from "@/entities/portal/lib/actions";
import { initials } from "@/kernel/ui/format";
import { isSubsection, makeIsActive, type NavGroup, type NavItem, type NavSection } from "@/kernel/shell/nav";
import { entitlementKeys, gateByEntitlement, withPrograms } from "./portal-nav-gate";

// Client-portal sibling of TeamSidebar: same admin shell CSS, flat nav. A nav
// item renders live only when its module has BOTH shipped (`enabled`) and the
// actor is entitled to it (`when`; design doc: "Team visible iff any company in
// scope has an active staff_assignments row", etc.) — otherwise it renders as a
// muted "soon" placeholder so the shell always looks complete without dead
// links. Rows with no `when` (Home, Requests) are always live once enabled.
import type { PortalEntitlements } from "@/entities/portal/lib/entitlements";

// The rows are no longer here. Each entity contributes them from its
// browser-safe door and app/nav.ts composes the ones this deployment installs
// (ADR 0002, RS-14); this component is handed the result and filters it by what
// this client bought. The Delivery group still leads with one link per active
// AI Program, which is per-company data rather than a deployment fact.

// Nav starts fully collapsed: every labeled group is closed on load, so the
// sidebar shows only the group labels until the user clicks one open.
function buildCollapsed(groups: NavGroup[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const group of groups) if (group.label) map[group.label] = true;
  return map;
}

export function PortalSidebar({
  sections,
  name,
  companyName,
  entitlements,
  programs = [],
  impersonating = false,
}: {
  // Composed by the composition root from the installed entities (app/nav.ts).
  sections: NavSection[];
  name: string;
  companyName: string | null;
  entitlements: PortalEntitlements;
  programs?: { id: string; name: string }[];
  // While an admin is viewing via Assume, the account menu ends the Assume
  // session instead of signing out — this is the admin's REAL session
  // underneath, not the client's, so a plain "Sign out" here would be wrong
  // (and confusing) rather than just ending the view-as.
  impersonating?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [navOpen, setNavOpen] = useState(false);
  const groups = withPrograms(gateByEntitlement(sections, entitlementKeys(entitlements)), programs);
  // Which row the address bar is on is the kernel's rule, not a local copy
  // (W.100, W.101). It is asked over the rows this sidebar draws, program links
  // included, because the rule decides which rows are indexes from the rows it
  // is given: /portal holds children, so Home lights on /portal alone.
  const isActive = makeIsActive([{ section: null, groups }]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => buildCollapsed(groups));
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  function toggleGroup(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

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
        <strong>8 Edges Client Portal</strong>
      </div>

      {navOpen && <div className="admin-scrim" onClick={() => setNavOpen(false)} />}

      <nav className={`admin-sidebar admin-portal-sidebar${navOpen ? " is-open" : ""}`} aria-label="Portal">
        <div className="admin-brand">
          <span className="admin-brand-lead">8 Edges Client Portal</span>
          <span className="admin-brand-actions">
            <button
              type="button"
              className="admin-avatarbtn"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              aria-label="Your account"
              onClick={() => setProfileMenuOpen((v) => !v)}
            >
              {initials(name)}
            </button>
          </span>
        </div>

        {profileMenuOpen && (
          <div className="admin-profilemenu-backdrop" onClick={() => setProfileMenuOpen(false)} />
        )}
        {profileMenuOpen && (
          <div className="admin-profilemenu" role="menu" aria-label="Your account">
            <div className="admin-profilemenu-head">
              <span className="admin-avatarbtn admin-avatarbtn--lg" aria-hidden>
                {initials(name)}
              </span>
              {/* Name only: the company already sits under the brand as the
                  section label, and this slot's break-all (built for emails)
                  hyphenates a company name mid-word. */}
              <span className="admin-profilemenu-email">{name}</span>
            </div>

            <div className="admin-profilemenu-sep" />

            <form action={impersonating ? endAssumeSession : signOut}>
              <button type="submit" className="admin-signout admin-profilemenu-signout">
                {impersonating ? "Exit assume mode" : "Sign out"}
              </button>
            </form>
          </div>
        )}

        <div className="admin-nav" onClick={() => setNavOpen(false)}>
          {companyName && <div className="admin-nav-sectlabel">{companyName}</div>}
          {groups.map((group, gi) => {
            const isCollapsed = Boolean(group.label && collapsed[group.label]);
            return (
              <div className="admin-nav-group" key={group.label ?? `g${gi}`}>
                {group.label && (
                  <button
                    className="admin-nav-grouplabel admin-nav-grouptoggle"
                    aria-expanded={!isCollapsed}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleGroup(group.label as string);
                    }}
                  >
                    {group.label}
                    <span className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </button>
                )}
                {!isCollapsed &&
                  // The portal's IA has no subsections, so every entry is a row.
                  group.items.filter((e): e is NavItem => !isSubsection(e)).map((item) =>
                    // The ungrouped items (Home) sit at section-header rank, so
                    // they take the header's accent bar and type rather than an
                    // item's icon-and-label row.
                    group.label === null ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`admin-nav-toplink${isActive(pathname, item.href) ? " is-active" : ""}`}
                      >
                        {item.label}
                      </Link>
                    ) : item.enabled ? (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`admin-nav-link${isActive(pathname, item.href) ? " is-active" : ""}`}
                      >
                        <span className="admin-nav-ico" aria-hidden>
                          {item.ico}
                        </span>
                        {item.label}
                      </Link>
                    ) : (
                      <span
                        key={item.href}
                        className="admin-nav-link u-disabled"
                        aria-disabled
                        title="Coming soon"
                      >
                        <span className="admin-nav-ico" aria-hidden>
                          {item.ico}
                        </span>
                        {item.label}
                        <span className="admin-nav-badge">soon</span>
                      </span>
                    ),
                  )}
              </div>
            );
          })}
        </div>

      </nav>
    </>
  );
}
