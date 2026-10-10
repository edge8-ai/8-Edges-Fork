"use client";

import { useState } from "react";
import type { PriorityLink } from "@/entities/coaching/lib/priority-link";

// Attaching one thing to read or do to a growth priority (L.6).
//
// Its own file because PrioritiesCard is a client component and this is two
// inputs plus a save and a clear; folding it in would push that card toward the
// 250-line cap for a control most priorities never use.
//
// It stays folded away until the coach asks for it. A priority with nothing
// attached is the normal case and must keep looking like the normal case, not
// like a row with an empty field in it.

export function PriorityLinkEditor({
  link,
  busy,
  onSave,
}: {
  link: PriorityLink | null;
  busy: boolean;
  /** null clears the link. */
  onSave: (link: { url: string; title: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(link?.url ?? "");
  const [title, setTitle] = useState(link?.title ?? "");

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
        {link ? "Change link" : "Attach a link"}
      </button>
    );
  }

  return (
    <div className="admin-coach-add-row">
      <input
        className="admin-input"
        placeholder="https://…"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        aria-label="Link address"
      />
      <input
        className="admin-input"
        placeholder="What to call it (optional)"
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Link title"
      />
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={busy}
        onClick={() => {
          // An empty address is how the coach clears it, so this one control
          // both sets and removes and there is no separate delete to explain.
          onSave(url.trim() ? { url, title } : null);
          setOpen(false);
        }}
      >
        Save
      </button>
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={busy}
        onClick={() => {
          setUrl(link?.url ?? "");
          setTitle(link?.title ?? "");
          setOpen(false);
        }}
      >
        Cancel
      </button>
    </div>
  );
}
