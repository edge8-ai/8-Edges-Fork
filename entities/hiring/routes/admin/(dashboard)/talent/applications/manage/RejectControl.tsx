"use client";

import { useState } from "react";

// Reject with a reason: the button reveals an inline reason field so the decision
// and its justification are captured together.
export function RejectControl({ onReject, disabled }: { onReject: (reason: string) => Promise<boolean>; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (disabled) return null;

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => setOpen(true)}>
        Reject…
      </button>
    );
  }
  return (
    <span className="u-row">
      <input
        className="admin-input u-w-200"
        autoFocus
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setReason("");
          }
        }}
      />
      <button
        type="button"
        className="admin-btn admin-btn--danger admin-btn--sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const okd = await onReject(reason);
          setBusy(false);
          if (okd) {
            setOpen(false);
            setReason("");
          }
        }}
      >
        {busy ? "Rejecting…" : "Confirm reject"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}
