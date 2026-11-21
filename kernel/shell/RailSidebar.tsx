"use client";

import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ORG_NAME } from "@/kernel/config/organisation";
import { shortcutLabel } from "@/kernel/ui/search-palette-model";
import { AccountControl } from "./AccountControl";
import type { AppView } from "./app-views";
import { SHELL_MARK } from "./brand-mark";
import { FoldedNav, Tip } from "./FoldedNav";
import type { NavGroup } from "./nav";
import type { NavIconName } from "./nav-icons";
import { edgeTab, foldShortcutLabel, isFoldShortcut, rememberSidebarFold } from "./sidebar-fold";

// The sidebar every signed-in staff shell draws (TH.29): one column holding
// this app's pages under the mark and the app's name, the account row pinned
// at its foot (./AccountControl), whose menu switches app, and on the column's
// edge a pull tab that folds it to icons (./FoldedNav) and pulls it back out.
// The Team and Admin sidebars each hand over their own pages and draw the open
// column's tree themselves; the frame is drawn one way.
//
// It replaced the app rail beside the panel (TH.28), which Dave found made the
// app switch, the least used control, the most prominent; the panel itself is
// unchanged. Only the pages scroll, so the account row is always in reach.
//
// On a phone the whole of it is the drawer the menu button opens, never folded:
// the drawer already gets out of the way.

const WIDE = "(min-width: 881px)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const noSubscribe = () => () => {};

const FOLD_ICON = "M11 7l-5 5 5 5 M18 7l-5 5 5 5";
const UNFOLD_ICON = "M6 7l5 5-5 5 M13 7l5 5-5 5";

export function RailSidebar({
  label,
  views,
  name,
  email = null,
  monogram,
  avatarUrl,
  border = null,
  profileHref,
  signOut,
  mark = SHELL_MARK,
  actions = null,
  search = null,
  onSearch,
  groups,
  groupIcons,
  here,
  countFor,
  initialFolded,
  navOpen,
  closeNav,
  children,
}: {
  /** The app's name: the open column's heading and both navs' label. */
  label: string;
  /** The apps the account menu switches between (./app-views). */
  views: AppView[];
  name: string;
  email?: string | null;
  monogram?: string;
  avatarUrl: string | null;
  border?: string | null;
  /** The signed-in person's own profile, or null where they have none. */
  profileHref: string | null;
  signOut: () => void | Promise<void>;
  /** The mark beside the heading; null (the public fork) draws the name alone. */
  mark?: string | null;
  /** The open column's heading buttons (Admin's inbox), drawn in the folded column too. */
  actions?: ReactNode;
  /** The open column's search row. */
  search?: ReactNode;
  /** What the folded column's search icon does: opens the same palette. */
  onSearch?: () => void;
  /** The pages, for the folded column's icons and flyouts. */
  groups: NavGroup[];
  groupIcons: Partial<Record<string, NavIconName>>;
  here: (href: string) => boolean;
  /** What waits on a row (the Team Inbox's asks), kept on its icon when folded. */
  countFor?: (href: string) => number;
  /** Whether the layout read the fold from its cookie (./sidebar-fold). */
  initialFolded: boolean;
  /** The phone drawer, which each sidebar opens from its own phone bar. */
  navOpen: boolean;
  closeNav: () => void;
  /** The open column's tree of pages. */
  children: ReactNode;
}) {
  const [foldPref, setFold] = useState(initialFolded);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
  const folded = foldPref && wide;
  const tab = edgeTab(wide, folded);
  const platform = useSyncExternalStore(noSubscribe, () => navigator.platform, () => "");

  // The cookie follows the choice, so the next page's layout draws it the same.
  useEffect(() => rememberSidebarFold(foldPref), [foldPref]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isFoldShortcut(e)) return;
      e.preventDefault();
      setFold((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`admin-sidebar shell-side${navOpen ? " is-open" : ""}${folded ? " is-folded" : ""}`}>
      {/* First, so tabbing reaches the tab before the pages it folds. On a
          phone it shows only on the open drawer, and closes it. */}
      <span className="shell-edge-wrap">
        <Tip label={tab.tip} sub={wide ? <kbd className="shell-tip-kbd">{foldShortcutLabel(platform)}</kbd> : undefined}>
          <button
            type="button"
            className="shell-edge"
            aria-label={tab.label}
            aria-expanded={tab.does !== "unfold"}
            onClick={tab.does === "close" ? closeNav : () => setFold(!folded)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
              <path d={tab.does === "unfold" ? UNFOLD_ICON : FOLD_ICON} />
            </svg>
          </button>
        </Tip>
      </span>

      <div className="shell-panel">
        {folded ? (
          <>
            {mark && (
              <div className="shell-fold-brand">
                {/* Alone here, so it names the organisation, from its config: never a name in code. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 26px mark from public/, which the fork does not ship */}
                <img className="shell-mark" src={mark} alt={ORG_NAME ?? ""} />
              </div>
            )}
            <FoldedNav
              label={label}
              groups={groups}
              groupIcons={groupIcons}
              here={here}
              countFor={countFor}
              actions={actions}
              onSearch={onSearch}
              searchHint={shortcutLabel(platform)}
              onNavigate={closeNav}
            />
          </>
        ) : (
          <nav className="shell-panel-wide" aria-label={label}>
            <div className="admin-brand">
              <span className="admin-brand-lead">
                {/* The name beside it says what the mark is, so the mark is not read out twice. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 26px mark from public/, which the fork does not ship */}
                {mark && <img className="shell-mark" src={mark} alt="" />}
                {label}
              </span>
              {actions && <span className="admin-brand-actions">{actions}</span>}
            </div>
            {/* A server-built slot whose chunk is still loading arrives as a lazy and
                escapes the fixed-children key check; the keyed Fragment gives it a key. */}
            <Fragment key="search">{search}</Fragment>
            {children}
          </nav>
        )}
      </div>

      <div className="shell-foot">
        <AccountControl
          name={name}
          email={email}
          monogram={monogram}
          avatarUrl={avatarUrl}
          border={border}
          views={views}
          profileHref={profileHref}
          signOut={signOut}
          compact={folded}
        />
      </div>
    </div>
  );
}
