"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Trip } from "@/entities/reimbursements/lib/trip-rules";
import { setOwnClaimTrip } from "../actions";
import { TripPicker } from "../TripPicker";

// The owner's trip picker on a claim they may still change (RB.11): choosing
// saves at once, and adding a trip here names it on the claim as well.
export function ClaimTrip({ claimId, trips, current }: { claimId: string; trips: Trip[]; current: Trip | null }) {
  const router = useRouter();
  const [value, setValue] = useState<string | null>(current?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A trip since cancelled or archived is no longer listed, but it is still
  // the one this claim names, so it stays a choice.
  const options = current && !trips.some((t) => t.id === current.id) ? [current, ...trips] : trips;

  const choose = (tripId: string | null) =>
    start(async () => {
      setError(null);
      const before = value;
      setValue(tripId);
      const res = await setOwnClaimTrip(claimId, tripId);
      if (!res.ok) {
        setValue(before);
        return setError(res.error);
      }
      router.refresh();
    });

  return (
    <div className="u-stack u-gap-2">
      <TripPicker id={`${claimId}-trip`} trips={options} value={value} onChange={choose} disabled={pending} />
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
