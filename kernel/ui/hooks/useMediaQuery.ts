import { useSyncExternalStore } from "react";

// Whether a CSS media query matches now, kept in step as the window changes.
//
// For a layout that has to change what is RENDERED, not only how it looks: a
// phone's card drawer moves its comment box into a bar pinned to the bottom
// (W.183), and two comment boxes in the DOM at once would be two drafts of one
// comment. CSS alone cannot move an element, so the component asks.
//
// The server snapshot is `false`, as in usePrefersReducedMotion: the markup Next
// renders is the wide layout, and the real value arrives on the first client
// subscribe, so hydration cannot mismatch.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
