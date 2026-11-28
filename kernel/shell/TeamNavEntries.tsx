"use client";

import Link from "next/link";
import { isSubsection, type NavEntry, type NavItem, type NavSubsection } from "@/kernel/shell/nav";
import { NavIcon } from "@/kernel/shell/NavIcon";
import { NavCount } from "./NavCount";

// The rows of one team sidebar group. Most groups are plain rows; Revenue is
// split into subsections (CRM, Commerce, Marketing) exactly as the admin Revenue
// office is, so this renders both with the admin nav's markup and classes.
// Subsections start collapsed, as they do in admin; whether one is open is kept
// by the sidebar with its groups, so it is remembered the same way (TH.5).
export function TeamNavEntries({
  entries,
  groupLabel,
  isActive,
  countFor,
  isSubOpen,
  setSubOpen,
}: {
  entries: NavEntry[];
  groupLabel: string | null;
  isActive: (href: string) => boolean;
  /** What waits on the person at a row (TH.8); 0 draws nothing. */
  countFor: (href: string) => number;
  isSubOpen: (key: string) => boolean;
  setSubOpen: (key: string, open: boolean) => void;
}) {

  function renderItem(item: NavItem, isSub: boolean) {
    const cls = `admin-nav-link${isActive(item.href) ? " is-active" : ""}${isSub ? " is-sub" : ""}`;
    if (item.enabled) {
      return (
        <Link key={item.href} href={item.href} className={cls}>
          <span className="admin-nav-ico" aria-hidden>
            {item.icon ? <NavIcon name={item.icon} /> : item.ico}
          </span>
          {item.label}
          <NavCount count={countFor(item.href)} />
        </Link>
      );
    }
    return (
      <span key={item.href} className={`${cls} u-disabled`} aria-disabled title="Coming soon">
        <span className="admin-nav-ico" aria-hidden>
          {item.icon ? <NavIcon name={item.icon} /> : item.ico}
        </span>
        {item.label}
        <span className="admin-nav-badge">soon</span>
      </span>
    );
  }

  function renderSubsection(sub: NavSubsection) {
    const key = `${groupLabel ?? ""}/${sub.subheading}`;
    const subCollapsed = !isSubOpen(key);
    return (
      <div key={`sub-${key}`}>
        <button
          className="admin-nav-subhead admin-nav-subtoggle"
          aria-expanded={!subCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            setSubOpen(key, subCollapsed);
          }}
        >
          {sub.subheading}
          <span className={`admin-nav-caret${subCollapsed ? " is-collapsed" : ""}`} aria-hidden>
            ▾
          </span>
        </button>
        {!subCollapsed && <div className="admin-nav-railgroup">{sub.items.map((item) => renderItem(item, true))}</div>}
      </div>
    );
  }

  return <>{entries.map((entry) => (isSubsection(entry) ? renderSubsection(entry) : renderItem(entry, false)))}</>;
}
