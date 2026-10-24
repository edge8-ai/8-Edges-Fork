"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Trip } from "@/entities/reimbursements/lib/trip-rules";
import { startClaim } from "../actions";
import { TripPicker } from "../TripPicker";

// The one field a claim needs to exist, and the trip it belongs to when there
// is one (RB.11): picked from the list, or added right here.
export function NewClaimForm({ trips }: { trips: Trip[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [tripId, setTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await startClaim(title, tripId);
      if (!res.ok) return setError(res.error);
      router.push(`/team/claims/${res.id}`);
    });

  return (
    <div className="u-stack u-gap-4">
      <div className="admin-field">
        <label className="admin-label" htmlFor="claim-title">
          Title
        </label>
        <input
          id="claim-title"
          className="admin-input"
          value={title}
          maxLength={200}
          autoComplete="off"
          placeholder="Hanoi client workshop"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && title.trim()) submit();
          }}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="claim-trip">
          Event <span className="admin-cell-muted">(optional)</span>
        </label>
        <TripPicker id="claim-trip" trips={trips} value={tripId} onChange={setTripId} disabled={pending} />
      </div>
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !title.trim()} onClick={submit}>
          {pending ? "Starting…" : "Start the claim"}
        </button>
      </div>
    </div>
  );
}
