"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// The Admin sidebar's navigation tree: sections, collapsible groups, labelled
// subsections and rows. Split out of AdminSidebar so the chrome (brand, profile
// menu, mobile bar) and the tree can each be read on their own.
//
// It renders whatever the composition root composed; see ./nav.ts for the
// contract and ./admin-ia.ts for the slots.
import {
  isSubsection,
  makeIsActive,
  type NavItem,
  type NavSection,
  type NavSubsection } from "./nav";

// Nav starts fully collapsed: every collapsible group and every subsection is
// closed on load, so the sidebar shows only the top-level labels. Clicking a
// group (e.g. Revenue) reveals its subsections (CRM, Commerce, Marketing).
function buildCollapsed(sections: NavSection[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const sect of sections) {
    for (const group of sect.groups) {
      if (group.label && group.collapsible) map[group.label] = true;
      for (const entry of group.items) {
        if (isSubsection(entry))
          map[`${group.label ?? ""}/${entry.subheading}`] = true;
      }
    }
  }
  return map;
}

export function AdminNav({
  sections,
  onNavigate,
}: {
  // Already only the rows this viewer may open (the Admin layout, ADR 0013).
  sections: NavSection[];
  /** Closes the mobile drawer once a row is clicked. */
  onNavigate: () => void;
}) {
  const pathname = usePathname() ?? "";
  // A row may name a query as well as a path since W.92.1 — the Workboard's
  // List, Calendar and Timeline are `?view=` on one page — so which row is
  // current is a question about the whole address bar, not the path alone.
  // The surface is dynamic (its layout guards on a cookie), so reading the
  // params here costs no static rendering.
  const searchParams = useSearchParams();
  const visible = sections;
  const isActive = makeIsActive(visible);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    buildCollapsed(visible),
  );

  function toggle(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  function renderItem(item: NavItem, isSub: boolean) {
    const cls = `admin-nav-link${isActive(pathname, item.href, searchParams ?? undefined) ? " is-active" : ""}${isSub ? " is-sub" : ""}`;
    if (item.enabled) {
      return (
        <Link key={item.href} href={item.href} className={cls}>
          <span className="admin-nav-ico" aria-hidden>
            {item.ico}
          </span>
          {item.label}
        </Link>
      );
    }
    return (
      <span
        key={item.href}
        className={`${cls} u-disabled`}
        aria-disabled
        title="Coming in a later phase"
      >
        <span className="admin-nav-ico" aria-hidden>
          {item.ico}
        </span>
        {item.label}
        <span className="admin-nav-badge">soon</span>
      </span>
    );
  }

  function renderSubsection(sub: NavSubsection, groupLabel: string | null) {
    const key = `${groupLabel ?? ""}/${sub.subheading}`;
    const subCollapsed = Boolean(collapsed[key]);
    return (
      <div key={`sub-${key}`}>
        <button
          className="admin-nav-subhead admin-nav-subtoggle"
          aria-expanded={!subCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            toggle(key);
          }}
        >
          {sub.subheading}
          <span
            className={`admin-nav-caret${subCollapsed ? " is-collapsed" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {!subCollapsed && (
          <div className="admin-nav-railgroup">
            {sub.items.map((item) => renderItem(item, true))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-nav" onClick={onNavigate}>
      {visible.map((sect, si) => (
        <div key={sect.section ?? `s${si}`}>
          {sect.section && (
            <div className="admin-nav-sectlabel">{sect.section}</div>
          )}
          {sect.groups.map((group, gi) => {
            const label = group.label;
            const isCollapsed = Boolean(
              label && group.collapsible && collapsed[label],
            );
            return (
              <div className="admin-nav-group" key={label ?? `g${gi}`}>
                {label && group.collapsible ? (
                  <button
                    className="admin-nav-grouplabel admin-nav-grouptoggle"
                    aria-expanded={!isCollapsed}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(label);
                    }}
                  >
                    {label}
                    <span
                      className={`admin-nav-caret${isCollapsed ? " is-collapsed" : ""}`}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </button>
                ) : (
                  label && <div className="admin-nav-grouplabel">{label}</div>
                )}
                {!isCollapsed &&
                  group.items.map((entry) =>
                    isSubsection(entry) ? renderSubsection(entry, label) : renderItem(entry, false),
                  )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
