"use client";

import type { KeyboardEvent, ReactNode } from "react";

// A table row that opens a drawer, clickable and keyboard-reachable as a whole
// (playbook rule 3: the whole row, not the name alone). Same shape as the
// vendors shelf's row.
export function RowButton({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onOpen();
  }
  return (
    <tr className="is-clickable" onClick={onOpen} onKeyDown={onKeyDown} tabIndex={0} role="button" aria-haspopup="dialog">
      {children}
    </tr>
  );
}
