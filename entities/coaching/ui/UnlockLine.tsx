"use client";

import { useEffect, useState } from "react";

// One quiet line when a part of the page unlocks (K.30): shown once per
// browser, then remembered in localStorage so it never nags. Storage can be
// missing or throw (private windows, cleared data), in which case the line
// simply shows again; nothing depends on it.

export function UnlockLine({ id, children }: { id: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const key = `coach-unlock-${id}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: show the line, remember nothing */
    }
    setShow(true);
  }, [id]);
  if (!show) return null;
  return <p className="coach-unlock admin-cell-muted">{children}</p>;
}
