"use client";

import { useState, useTransition } from "react";
import { confirmProposedDate, declineProposedDate } from "@/entities/coaching/lib/schedule-actions";

// The coach's one click on a date their coachee proposed (K.32). It is a client
// island because both surfaces that show a proposal — the roster page and the
// coach profile header — are server components, and the whole interaction is
// two buttons: confirm writes the date and the scheduled row, decline clears
// the proposal and leaves whatever was already booked standing.

export function ProposalActions({ profileId }: { profileId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn(profileId);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <span className="admin-form-actions">
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={pending}
        onClick={() => run(confirmProposedDate)}
      >
        {pending ? "Saving…" : "Confirm"}
      </button>
      <button
        type="button"
        className="admin-link-btn"
        disabled={pending}
        onClick={() => run(declineProposedDate)}
      >
        Decline
      </button>
      {error && <span className="admin-cell-muted">{error}</span>}
    </span>
  );
}
