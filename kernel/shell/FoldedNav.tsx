"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { isSubsection, type NavEntry, type NavGroup, type NavItem } from "./nav";
import type { NavIconName } from "./nav-icons";
import { NavIcon } from "./NavIcon";

// The sidebar folded to icons (the app rail redesign, 25 Oct 2026). Folding
// hides nothing: each row outside a group keeps its icon, and each group is one
// icon that opens its rows in a flyout. One icon per row would not do: a
// group's rows often share a picture, and the Admin rows carry text glyphs, so
// a column of them says nothing. Every icon names itself in a tooltip, on hover
// and on keyboard focus, and a count waiting on a row stays on its icon.

/** A tooltip beside its trigger. The trigger carries the name for a screen reader, so the tip is hidden from one. */
export function Tip({ label, sub, children }: { label: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <span className="shell-tipw">
      {children}
      <span className="shell-tip" aria-hidden>
        {label}
        {sub}
      </span>
    </span>
  );
}

function ItemIcon({ item }: { item: NavItem }) {
  return item.icon ? <NavIcon name={item.icon} /> : <span className="shell-fold-glyph">{item.ico}</span>;
}

/**
 * What waits on a row: drawn only when something does. A reader hears it as a
 * phrase, never a bare number: in the row's text inside a flyout, in the
 * icon's name where the icon is all there is.
 */
const waitingPhrase = (count: number) => (count > 0 ? `, ${count} waiting on you` : "");
function Count({ count, inText = false }: { count: number; inText?: boolean }) {
  if (count <= 0) return null;
  return (
    <>
      <span className="shell-fold-count" aria-hidden>
        {count > 9 ? "9+" : count}
      </span>
      {inText && <span className="u-sr-only">{waitingPhrase(count)}</span>}
    </>
  );
}

// The air a flyout keeps from the top and bottom of the screen, as admin.css caps its height.
const FLY_MARGIN = 16;

const rowsOf = (entries: NavEntry[]): NavItem[] => entries.flatMap((e) => (isSubsection(e) ? e.items : [e]));

export function FoldedNav({
  label,
  groups,
  groupIcons,
  here,
  countFor = () => 0,
  actions = null,
  onSearch,
  searchHint,
  onNavigate,
}: {
  label: string;
  groups: NavGroup[];
  /** Each labelled group's icon; a group without one takes its first row's. */
  groupIcons: Partial<Record<string, NavIconName>>;
  here: (href: string) => boolean;
  countFor?: (href: string) => number;
  actions?: ReactNode;
  onSearch?: () => void;
  searchHint?: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const openRef = useRef<HTMLSpanElement>(null);

  // A flyout opens beside its icon and reads down from it. A long group low in
  // the column (Admin's Revenue has some twenty rows) would run off the bottom
  // of the screen, so it moves up just enough to fit, before it paints; its
  // height is capped at the screen's in admin.css, so moving up always does.
  useLayoutEffect(() => {
    const fly = openRef.current?.querySelector<HTMLElement>(".shell-fly");
    if (!fly) return;
    const { top, bottom } = fly.getBoundingClientRect();
    const over = bottom - (window.innerHeight - FLY_MARGIN);
    if (over > 0) fly.style.translate = `0 ${-Math.min(over, top - FLY_MARGIN)}px`;
  }, [open]);

  // An open flyout closes on Escape, which hands focus back to its icon, and on
  // a press anywhere outside it.
  useEffect(() => {
    if (!open) return;
    openRef.current?.querySelector<HTMLElement>(".shell-fly a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      openRef.current?.querySelector("button")?.focus();
      setOpen(null);
    };
    const onDown = (e: PointerEvent) => {
      if (openRef.current && !openRef.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const top = rowsOf(groups.filter((g) => !g.label).flatMap((g) => g.items));
  const labelled = groups.filter((g): g is NavGroup & { label: string } => Boolean(g.label));

  function flyRow(item: NavItem) {
    const active = here(item.href);
    const cls = `admin-nav-link${active ? " is-active" : ""}`;
    const icon = (
      <span className="admin-nav-ico" aria-hidden>
        <ItemIcon item={item} />
      </span>
    );
    if (!item.enabled) {
      return (
        <span key={item.href} className={`${cls} u-disabled`} aria-disabled>
          {icon}
          {item.label}
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cls}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          setOpen(null);
          onNavigate();
        }}
      >
        {icon}
        {item.label}
        <Count count={countFor(item.href)} inText />
      </Link>
    );
  }

  return (
    <nav className="shell-fold" aria-label={label}>
      {actions && <div className="shell-fold-actions">{actions}</div>}
      {onSearch && (
        <Tip label="Search" sub={searchHint && <kbd className="shell-tip-kbd">{searchHint}</kbd>}>
          <button type="button" className="shell-fold-btn" aria-label={`Search ${label}`} onClick={onSearch}>
            <NavIcon name="search" />
          </button>
        </Tip>
      )}
      {top.length > 0 && <div className="shell-fold-rule" />}
      {top.map((item) => {
        const active = here(item.href);
        const count = countFor(item.href);
        return (
          <Tip key={item.href} label={item.label}>
            {item.enabled ? (
              <Link
                href={item.href}
                className={`shell-fold-btn${active ? " is-active" : ""}`}
                aria-label={item.label + waitingPhrase(count)}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <ItemIcon item={item} />
                <Count count={count} />
              </Link>
            ) : (
              <span className="shell-fold-btn u-disabled" aria-label={item.label} aria-disabled>
                <ItemIcon item={item} />
              </span>
            )}
          </Tip>
        );
      })}
      {labelled.length > 0 && <div className="shell-fold-rule" />}
      {labelled.map((g) => {
        const isOpen = open === g.label;
        const rows = rowsOf(g.items);
        const holds = rows.some((i) => here(i.href));
        const waiting = rows.reduce((n, i) => n + countFor(i.href), 0);
        const icon = groupIcons[g.label] ?? rows.find((i) => i.icon)?.icon ?? "list";
        return (
          <span key={g.label} className="shell-tipw" ref={isOpen ? openRef : undefined}>
            <button
              type="button"
              className={`shell-fold-btn${holds ? " is-active" : ""}${isOpen ? " is-open" : ""}`}
              aria-label={g.label + waitingPhrase(waiting)}
              aria-haspopup="true"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : g.label)}
            >
              <NavIcon name={icon} />
              <span className="shell-fold-more" aria-hidden />
              <Count count={waiting} />
            </button>
            {!isOpen && (
              <span className="shell-tip" aria-hidden>
                {g.label}
                <span className="shell-tip-sub">{rows.length === 1 ? "1 page" : `${rows.length} pages`}</span>
              </span>
            )}
            {isOpen && (
              <div className="shell-fly" role="group" aria-label={g.label}>
                <div className="shell-fly-head">{g.label}</div>
                {g.items.map((e) =>
                  isSubsection(e) ? (
                    <Fragment key={`sub-${e.subheading}`}>
                      <div className="admin-nav-subhead">{e.subheading}</div>
                      {e.items.map(flyRow)}
                    </Fragment>
                  ) : (
                    flyRow(e)
                  ),
                )}
              </div>
            )}
          </span>
        );
      })}
    </nav>
  );
}
