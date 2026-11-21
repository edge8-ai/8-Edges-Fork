"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceCandidate, rejectCandidate, requestBooking } from "./manage-actions";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";

// The hiring manager's verbs on one candidate row. Authorization is enforced in
// the server actions; this only decides which buttons to show. Reject asks for
// confirmation because it closes the application.
export function CandidateActions({
  applicationId,
  canRequestBooking,
  bookingRequested,
}: {
  applicationId: string;
  canRequestBooking: boolean;
  bookingRequested: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(bookingRequested);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  return (
    <div className="u-row u-end u-wrap">
      {error && (
        <span className="admin-cell-muted u-sm u-err">
          {error}
        </span>
      )}
      {canRequestBooking &&
        (requested ? (
          <span className="admin-badge admin-badge--info">Booking requested</span>
        ) : (
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={pending}
            onClick={() => run(() => requestBooking(applicationId), () => setRequested(true))}
          >
            Request booking
          </button>
        ))}
      <button
        type="button"
        className="admin-btn admin-btn--sm"
        disabled={pending}
        onClick={() => run(() => advanceCandidate(applicationId))}
      >
        Advance
      </button>
      <ConfirmButton
        label="Reject"
        className="admin-btn admin-btn--sm admin-btn--danger"
        title="Reject this candidate?"
        body="This closes the application."
        confirmLabel="Reject"
        disabled={pending}
        onConfirm={() => rejectCandidate(applicationId)}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
