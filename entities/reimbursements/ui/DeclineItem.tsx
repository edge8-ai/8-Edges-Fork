"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";

// Declining one receipt (plan section 8): it stays on the claim, with the
// reason its owner reads, and leaves the total that goes on to the approver.
// A declined receipt can be restored until the claim is checked. The action is
// the checker's, handed in by the page (nothing under ui/ may import a route),
// so the Team view's checker page and Admin's claim page share this island.
export function DeclineItem({
  claimId,
  itemId,
  declined,
  decline,
}: {
  claimId: string;
  itemId: string;
  declined: boolean;
  decline: (claimId: string, itemId: string, reason: string | null) => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (why: string | null) =>
    start(async () => {
      setError(null);
      const res = await decline(claimId, itemId, why);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setReason("");
      router.refresh();
    });

  if (declined) {
    return (
      <span className="u-stack u-gap-1">
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => save(null)}>
          Restore
        </button>
        {error && <span className="admin-alert admin-alert--err">{error}</span>}
      </span>
    );
  }
  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)}>
        Decline
      </button>
    );
  }
  return (
    <span className="u-stack u-gap-1">
      <input
        className="admin-input"
        maxLength={2000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why this receipt is not paid"
        aria-label="Why this receipt is declined"
      />
      <span className="u-row u-gap-1">
        <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" disabled={pending || !reason.trim()} onClick={() => save(reason)}>
          Decline
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}
