"use client";

import { NavIcon } from "@/kernel/shell/NavIcon";
import { openSearchPalette } from "@/kernel/ui/search-palette-model";

// The bar across the top of the team hub on a phone (TH.5). It used to hold
// the menu button and "Edge8 Team", so on a phone nothing said which page you
// were on until you opened the drawer, and search sat inside the drawer. It
// now names the page — the sidebar row you are on, or the hub's name on a page
// no row points at — and opens search directly.
export function TeamMobileBar({ title, onOpenNav }: { title: string | null; onOpenNav: () => void }) {
  return (
    <div className="admin-mobilebar">
      <button className="admin-mobile-toggle" aria-label="Open navigation" onClick={onOpenNav}>
        <NavIcon name="menu" />
      </button>
      <span className="admin-mobile-title">
        {title && <span className="admin-mobile-brand">Edge8 Team</span>}
        <strong>{title ?? "Edge8 Team"}</strong>
      </span>
      <button className="admin-mobile-toggle" aria-label="Search" onClick={openSearchPalette}>
        <NavIcon name="search" />
      </button>
    </div>
  );
}
