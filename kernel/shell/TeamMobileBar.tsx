"use client";

import Link from "next/link";
import { NavIcon } from "@/kernel/shell/NavIcon";
import type { NavIconName } from "@/kernel/shell/nav-icons";
import { openSearchPalette } from "@/kernel/ui/search-palette-model";
import { openAssistant } from "@/kernel/ui/assistant-launcher";
import { NavCount } from "./NavCount";

// The bar across the top of the team hub on a phone (TH.5). It used to hold
// the menu button and "Edge8 Team", so on a phone nothing said which page you
// were on until you opened the drawer, and search sat inside the drawer. It
// now names the page — the sidebar row you are on, or the hub's name on a page
// no row points at — and opens search directly. Since TH.8 the Inbox sits
// beside search with its count, so what waits on a person is seen on a phone
// without opening the drawer.
export function TeamMobileBar({
  title,
  onOpenNav,
  quick = null,
  assistant = false,
}: {
  title: string | null;
  onOpenNav: () => void;
  /** The counted row (the Inbox), drawn as a button with its count; null draws none. */
  quick?: { href: string; label: string; icon: NavIconName | null; count: number } | null;
  /**
   * True when the layout mounts the team assistant. The bar then opens it, and
   * the widget draws no floating button on a phone (TH.25). False while an
   * admin is viewing as someone, when no assistant is mounted.
   */
  assistant?: boolean;
}) {
  return (
    <div className="admin-mobilebar">
      <button className="admin-mobile-toggle" aria-label="Open navigation" onClick={onOpenNav}>
        <NavIcon name="menu" />
      </button>
      <span className="admin-mobile-title">
        {title && <span className="admin-mobile-brand">Edge8 Team</span>}
        <strong>{title ?? "Edge8 Team"}</strong>
      </span>
      <span className="admin-mobile-actions">
        {assistant && (
          <button className="admin-mobile-toggle admin-mobile-ai" aria-label="Open team assistant" onClick={openAssistant}>
            <NavIcon name="chat" />
          </button>
        )}
        {quick && (
          // Named by text rather than aria-label, which would replace the
          // count's phrase: a reader hears "Inbox, 3 waiting on you".
          <Link className="admin-mobile-toggle admin-mobile-quick" href={quick.href}>
            {quick.icon && <NavIcon name={quick.icon} />}
            <span className={quick.icon ? "u-sr-only" : undefined}>{quick.label}</span>
            <NavCount count={quick.count} />
          </Link>
        )}
        <button className="admin-mobile-toggle" aria-label="Search" onClick={openSearchPalette}>
          <NavIcon name="search" />
        </button>
      </span>
    </div>
  );
}
