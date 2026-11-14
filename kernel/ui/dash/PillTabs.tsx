"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type PillTab = { href: string; label: string; exact?: boolean };

// Route-based tabs as a segmented control: one filled pill for the active
// route, the rest quiet. Active state comes from the pathname, exact for a hub
// root and prefix for its sections, so a deep link opens on the right tab.
export function PillTabs({ tabs, ariaLabel }: { tabs: PillTab[]; ariaLabel: string }) {
  const pathname = (usePathname() ?? "").replace(/\/$/, "");
  return (
    <nav className="dash-tabs" aria-label={ariaLabel}>
      {tabs.map((t) => {
        // Match on the path alone; a tab may carry a query (a period) it wants kept.
        const path = t.href.split("?")[0];
        const active = t.exact ? pathname === path : pathname.startsWith(path);
        return (
          <Link key={t.href} href={t.href} className={`dash-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
