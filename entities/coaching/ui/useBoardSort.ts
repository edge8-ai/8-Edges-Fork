"use client";

import { useEffect, useState } from "react";
import { isSortMode, type SortMode } from "@/entities/coaching/lib/stack-order";

// Where this browser remembers how the member likes the board ordered. It is a
// view preference, not a fact about the work: it never reaches the row, it does
// not follow the member to another device, and the board is correct in the
// member's own stack when it is missing (K.66).
const SORT_KEY = "coach-board-order";

export function useBoardSort(): [SortMode, (mode: SortMode) => void] {
  const [mode, setMode] = useState<SortMode>("manual");
  // Read after mount, not during render: the server has no localStorage, and a
  // stored mode applied during render would be a hydration mismatch.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SORT_KEY);
      if (isSortMode(saved)) setMode(saved);
    } catch {
      /* no stored preference reads the same as the default */
    }
  }, []);

  return [
    mode,
    (next: SortMode) => {
      setMode(next);
      try {
        window.localStorage.setItem(SORT_KEY, next);
      } catch {
        /* the board still sorts; it only forgets by the next visit */
      }
    },
  ];
}
