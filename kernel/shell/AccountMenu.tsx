"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import type { AppView } from "./app-views";
import { NavIcon } from "./NavIcon";

// The menu the account row opens (./AccountControl, TH.29): who is signed in,
// the apps they may switch to with a tick on the one they are in, their
// profile, and Sign out. The switch lived on the app rail's tiles (TH.28),
// which put a control most people never use at the top of every sidebar.
//
// Where it opens is admin.css's: beside the sidebar on a wide screen, level
// with the row, so it covers none of the sidebar's rows; inside the phone
// drawer, above the row, where there is no room beside it.
//
// The keyboard model its role="menu" promises: opening it focuses the first
// item; the arrow keys, Home and End move between items; Tab leaves and closes
// it; Escape closes it and puts focus back on the row that opened it. A press
// anywhere outside the menu and its row closes it too, listened for on the
// document rather than caught by a backdrop: the sidebar is the containing
// block of its fixed children (its backdrop-filter), so a backdrop drawn inside
// it could cover the sidebar alone.

export function AccountMenu({
  name,
  subline = null,
  face,
  views,
  profileHref,
  signOut,
  signOutLabel = "Sign out",
  onClose,
  openerRef,
}: {
  name: string;
  /** The line under the name (the address), as the row that opened the menu shows it. */
  subline?: string | null;
  face: ReactNode;
  views: AppView[];
  /** The signed-in person's own profile, or null where they have none to open. */
  profileHref: string | null;
  signOut: () => void | Promise<void>;
  /** "Exit assume mode" while an admin views a client's portal as them. */
  signOutLabel?: string;
  onClose: () => void;
  /** The row that opened the menu: a press on it is its own toggle, not an outside press. */
  openerRef?: RefObject<HTMLElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      openerRef?.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || openerRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose, openerRef]);

  function onMenuKey(e: ReactKeyboardEvent) {
    if (e.key === "Tab") {
      onClose();
      return;
    }
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at < 0 ? -1 : at - 1, Home: 0, End: -1 };
    const to = moves[e.key];
    if (to === undefined || list.length === 0) return;
    e.preventDefault();
    list[(to + list.length) % list.length]?.focus();
  }

  return (
    <div ref={menuRef} className="admin-profilemenu shell-account-menu" role="menu" aria-label="Your account" onKeyDown={onMenuKey}>
      <div className="admin-profilemenu-head shell-account-menu-head">
        {face}
        <span className="shell-account-who">
          <span className="shell-account-name">{name}</span>
          {subline && <span className="shell-account-email">{subline}</span>}
        </span>
      </div>
      <div className="admin-profilemenu-sep shell-account-menu-headsep" />
      {views.length > 1 && (
        <>
          <div className="admin-profilemenu-label">Switch app</div>
          {views.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              className="admin-profilemenu-item"
              role="menuitem"
              tabIndex={-1}
              aria-current={v.current ? "true" : undefined}
              onClick={onClose}
            >
              <span className="admin-profilemenu-ico" aria-hidden>
                <NavIcon name={v.icon} />
              </span>
              {v.label}
              {v.current && (
                <span className="shell-account-tick" aria-hidden>
                  <NavIcon name="check" />
                </span>
              )}
            </Link>
          ))}
          <div className="admin-profilemenu-sep" />
        </>
      )}
      {profileHref && (
        <>
          <Link href={profileHref} className="admin-profilemenu-item" role="menuitem" tabIndex={-1} onClick={onClose}>
            <span className="admin-profilemenu-ico" aria-hidden>
              <NavIcon name="profile" />
            </span>
            View profile
          </Link>
          <div className="admin-profilemenu-sep" />
        </>
      )}
      <form action={signOut}>
        <button type="submit" className="admin-profilemenu-item shell-account-signout" role="menuitem" tabIndex={-1}>
          <span className="admin-profilemenu-ico" aria-hidden>
            <NavIcon name="signOut" />
          </span>
          <span>{signOutLabel}</span>
        </button>
      </form>
    </div>
  );
}
