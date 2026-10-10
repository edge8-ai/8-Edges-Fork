"use client";

import { useState } from "react";
import Link from "next/link";
import { isSubsection, type NavEntry, type NavItem, type NavSubsection } from "@/kernel/shell/nav";

// The rows of one team sidebar group. Most groups are plain rows; Revenue is
// split into subsections (CRM, Commerce, Marketing) exactly as the admin Revenue
// office is, so this renders both with the admin nav's markup and classes.
// Subsections start collapsed, as they do in admin.
export function TeamNavEntries({
  entries,
  groupLabel,
  isActive,
}: {
  entries: NavEntry[];
  groupLabel: string | null;
  isActive: (href: string) => boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(entries.filter(isSubsection).map((s) => [s.subheading, true])),
  );

  function renderItem(item: NavItem, isSub: boolean) {
    const cls = `admin-nav-link${isActive(item.href) ? " is-active" : ""}${isSub ? " is-sub" : ""}`;
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
      <span key={item.href} className={`${cls} u-disabled`} aria-disabled title="Coming soon">
        <span className="admin-nav-ico" aria-hidden>
          {item.ico}
        </span>
        {item.label}
        <span className="admin-nav-badge">soon</span>
      </span>
    );
  }

  function renderSubsection(sub: NavSubsection) {
    const subCollapsed = Boolean(collapsed[sub.subheading]);
    return (
      <div key={`sub-${groupLabel ?? ""}/${sub.subheading}`}>
        <button
          className="admin-nav-subhead admin-nav-subtoggle"
          aria-expanded={!subCollapsed}
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((c) => ({ ...c, [sub.subheading]: !c[sub.subheading] }));
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
