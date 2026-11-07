"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * How tall a board's lanes may be, measured rather than assumed (W.104.5).
 *
 * `.admin-kanban-col` caps its height so a lane scrolls inside itself instead
 * of growing the page. That cap was the constant `calc(100vh - 210px)`: right
 * when it was written, and wrong by 2026-09-22, when the board started at
 * 237px and its bottom edge sat below the fold. The window then scrolled
 * behind lanes that were already scrolling — two scrollbars for one list, and
 * the lane you were reading moved under you when you used the wrong one.
 *
 * A constant cannot survive a toolbar that gains a row, so this measures and
 * writes `--wb-board-h` on the board element; the stylesheet keeps the old
 * expression as the fallback, which is what the first server-rendered paint
 * uses and what any board that never mounts this hook keeps.
 *
 * WHAT IT SUBTRACTS, AND WHY THE ANCESTORS MATTER. The lanes have to fit in
 * the viewport *including everything drawn below them*, or the page scrolls by
 * exactly that much: the board's own `padding-bottom` (12px) and the surface's
 * `.admin-main` bottom padding (64px) were together 76px of page scroll that
 * subtracting only the top could never account for. Walking the ancestors for
 * their bottom padding and margin is what makes the answer whole. It stops at
 * `body`, so a page that pads its own edges is included and the document's
 * margins are not.
 *
 * WHY A ref CALLBACK AND NOT AN EFFECT ON A ref OBJECT: the board mounts, and
 * on some surfaces remounts, inside a keyed tab panel. The measurement has to
 * happen when the node arrives, not when the component that owns it first
 * renders, or a board revealed by a tab switch is measured against the
 * position it had before the switch.
 */

/** Below this a lane cannot hold a card, so the stylesheet's own value is the better answer. */
const MIN_LANE_HEIGHT = 160;

function spaceBelow(el: HTMLElement): number {
  const own = getComputedStyle(el);
  let below = (parseFloat(own.paddingBottom) || 0) + (parseFloat(own.marginBottom) || 0);
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    below += (parseFloat(s.paddingBottom) || 0) + (parseFloat(s.marginBottom) || 0);
  }
  return below;
}

export function useBoardViewport() {
  const node = useRef<HTMLElement | null>(null);

  const measure = useCallback(() => {
    const el = node.current;
    if (!el) return;
    // Viewport-relative, like the `100vh` this replaces, so the two agree.
    // Only ever read on mount and on resize — after a scroll it answers a
    // smaller number and the lanes would shrink as the page moved.
    const top = el.getBoundingClientRect().top;
    const available = Math.round(window.innerHeight - top - spaceBelow(el));
    if (available < MIN_LANE_HEIGHT) {
      el.style.removeProperty("--wb-board-h");
      return;
    }
    el.style.setProperty("--wb-board-h", `${available}px`);
  }, []);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      node.current = el;
      measure();
    },
    [measure],
  );

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // A window resize is not the only thing that moves the board's top edge.
    // The Workboard's toolbar wraps to a second row the moment the filters
    // need one, and folds back when they are cleared — the board slides down
    // and up with no resize event at all, and lanes measured before the wrap
    // would run past the fold for as long as the filter stayed on. Watching
    // the board's PARENT is what sees that: the board's own box does not
    // change when the thing above it grows.
    const parent = node.current?.parentElement;
    const observer =
      parent && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    observer?.observe(parent as Element);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  return ref;
}
