"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// When this browser last looked at this surface (W.63).
//
// localStorage, keyed by pathname, the way the Board/List toggle and the
// remembered filter set already are: My Work, a hub tab and a single board
// each keep their own, because "what changed" means "what changed here".
//
// The stamp is written ONCE, on mount, after the previous value has been
// read. So the line survives the whole visit — a reader can look away and
// come back to the tab without the news disappearing — and the next visit is
// measured from this one. A first-ever visit reads null and shows nothing.

const KEY_PREFIX = "workboard:seen:";

export type LastVisit = {
  /** The previous visit's ISO timestamp, or null on a first-ever visit. */
  since: string | null;
  /** Marks the surface seen as of now, which clears the line. */
  markSeen: () => void;
};

export function useLastVisit(): LastVisit {
  const pathname = usePathname();
  // One key per surface, one spelling per surface: a trailing slash is the
  // same board, not a second one to remember separately.
  const key = `${KEY_PREFIX}${(pathname ?? "").replace(/\/+$/, "") || "/"}`;
  // Server and first client paint agree on null; the stored value arrives
  // after mount, so the markup does not differ between the two.
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(key);
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Storage may be unavailable (private window, blocked site data). Then
      // there is no "last time you looked" to speak of and the line is simply
      // absent, which is the same as a first visit.
    }
    setSince(previous);
  }, [key]);

  return {
    since,
    markSeen: () => {
      try {
        localStorage.setItem(key, new Date().toISOString());
      } catch {
        // See above; the line clears for this visit either way.
      }
      setSince(null);
    },
  };
}
