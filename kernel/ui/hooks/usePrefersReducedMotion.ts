import { useSyncExternalStore } from "react";

// Whether the viewer has asked the OS to reduce motion. Autoplaying carousels
// must stop for them, so this drives the "pause" branch of every slider.
//
// useSyncExternalStore rather than useEffect + useState because the media query
// is external state that can change mid-session; the server snapshot is `false`
// so the markup Next renders is the motion-on variant and hydration cannot
// mismatch — the real value arrives on the first client subscribe.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}
