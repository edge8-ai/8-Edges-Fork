"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabDef = { key: string; label: string; count?: number; content: ReactNode };

// The key handling lives outside the component because it has to be provable.
// kernel/ui/Tabs.test.tsx renders through renderToStaticMarkup, which can read
// the markup a render produced but cannot press a key, and the repo has no
// jsdom — so the arrow-key behaviour would otherwise ship with no test at all.
// Answers the index the selection should move to, or null when the key is not
// one the tab list claims, which is the caller's signal to leave the event
// alone so typing and browser shortcuts still reach the page.
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  // Both arrows wrap, as the ARIA tabs pattern specifies: a tab list is a ring,
  // and stopping at the ends would strand someone who arrowed one step too far.
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

// Server-rendered tab content is passed in as ReactNode (RSC payload) — all
// panels are rendered upfront from already-fetched data; this only toggles which
// is visible. initialKey lets a page open on a specific tab (e.g. from a ?tab=
// param); an unknown key falls back to the first tab. syncParam additionally
// writes the active key into that URL query param on click (history.replaceState,
// no navigation), so URL-driven islands inside a panel (search, pagination)
// round-trip back to the same tab. Without both props, behavior is unchanged.
export function Tabs({
  tabs,
  initialKey,
  syncParam,
}: {
  tabs: TabDef[];
  initialKey?: string;
  syncParam?: string;
}) {
  const [active, setActive] = useState(
    tabs.some((t) => t.key === initialKey) ? initialKey : tabs[0]?.key,
  );
  // One panel element is reused for every tab, so every tab points aria-controls
  // at that single id and the panel takes its name from whichever tab is
  // selected. Without the pair a screen reader reads a tab list whose tabs
  // control nothing, and never announces the panel as the region a tab opened.
  // useId scopes the ids to this instance, because two tab sets on one page
  // would otherwise both claim the same panel id. The suffix is the tab's index
  // rather than its key, because aria-controls and aria-labelledby hold
  // space-separated ID lists and this component does not choose its callers'
  // keys — one with a space in it would break the link with nothing to catch it.
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  function select(key: string) {
    setActive(key);
    if (syncParam && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set(syncParam, key);
      window.history.replaceState(null, "", url.toString());
    }
  }
  // findIndex answers -1 for a key no tab carries, which is the case the earlier
  // `?? tabs[0]` covered; the panel needs the index as well as the tab, to name
  // itself after the button that opened it.
  const activeIndex = tabs.findIndex((t) => t.key === active);
  const currentIndex = activeIndex === -1 ? 0 : activeIndex;
  const current = tabs[currentIndex];
  // The buttons are held so a key press can move DOM focus as well as the
  // selection. Moving only the selection would leave focus on the tab the
  // person arrowed away from, and the next Tab press would then jump out of
  // the list from the wrong place.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function onTabListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, currentIndex, tabs.length);
    if (next === null) return;
    // Left and right otherwise scroll a horizontally overflowing tab strip, and
    // Home and End jump the whole page — both would fight the move we just made.
    event.preventDefault();
    select(tabs[next].key);
    tabRefs.current[next]?.focus();
  }
  return (
    <div>
      <div className="admin-tabs" role="tablist" onKeyDown={onTabListKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={tabId(i)}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            // Selection is read off currentIndex rather than the key, so the
            // clamp that picks the first tab for an unrecognised active key is
            // the same one the panel and the roving tabindex see. Three answers
            // derived from one index cannot disagree.
            aria-selected={i === currentIndex}
            aria-controls={panelId}
            // The roving tabindex: the list is one Tab stop, so a seven-tab page
            // no longer walks seven buttons before reaching the panel. The
            // arrow keys above are what keeps the other six reachable.
            tabIndex={i === currentIndex ? 0 : -1}
            className={`admin-tab${i === currentIndex ? " is-active" : ""}`}
            onClick={() => select(t.key)}
          >
            {t.label}
            {typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>
      {/* aria-labelledby is left off when tabs is empty, so it never points at an id no button carries. */}
      <div id={panelId} role="tabpanel" aria-labelledby={current ? tabId(currentIndex) : undefined}>
        {current?.content}
      </div>
    </div>
  );
}
