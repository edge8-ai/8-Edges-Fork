"use client";

import { useRef, useState } from "react";

// The parts every click-to-edit field shares (InlineEdit.tsx, EditableTypedDate.tsx):
// the save contract, the Escape that cancels an edit without closing the
// drawer, the saving / error note, and the optimistic value that re-syncs.

export type InlineSaveResult = { ok: true } | { ok: false; error: string };
export type Save = (value: string) => Promise<InlineSaveResult>;

// DetailDrawer listens for Escape on document (the same node React delegates to),
// so a plain stopPropagation cannot cancel an edit without also closing the
// drawer. stopImmediatePropagation on the native event does.
export function stopEsc(e: React.KeyboardEvent) {
  if (e.key === "Escape") e.nativeEvent.stopImmediatePropagation();
}

export function SaveNote({ saving, error }: { saving: boolean; error: string | null }) {
  if (saving) return <span className="admin-cell-muted admin-editable-note">saving…</span>;
  if (error) return <span className="admin-editable-note admin-editable-note--err">{error}</span>;
  return null;
}

// Adjust local state when the incoming value prop actually changes (parent
// refetch), without clobbering an in-flight optimistic value during typing.
export function useSynced(value: string): [string, (v: string) => void] {
  const [current, setCurrent] = useState(value);
  const seen = useRef(value);
  if (seen.current !== value) {
    seen.current = value;
    setCurrent(value);
  }
  return [current, setCurrent];
}
