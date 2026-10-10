"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";

// Entering one receipt's rate by hand (RB.10): the floor when no bank had a
// rate for the day, or when the bank's rate is not the one to use. VND per
// one unit of the receipt's currency; the receipt is valued at it and the
// rate is kept with the checker's name. A pending receipt shows the form
// open, since it cannot be checked without it; a valued one offers a change.
// The page hands in the server action behind its own guard, as it does for
// the other decision controls, so the Team and Admin claim pages share it.
export function EnterRate({
  claimId,
  itemId,
  currency,
  pending: ratePending,
  enter,
}: {
  claimId: string;
  itemId: string;
  currency: string;
  pending: boolean;
  enter: (claimId: string, itemId: string, rate: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(ratePending);
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const res = await enter(claimId, itemId, rate);
      if (!res.ok) return setError(res.error);
      setRate("");
      setOpen(false);
      router.refresh();
    });

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setOpen(true)}>
        Enter the rate by hand
      </button>
    );
  }
  const code = currency.toUpperCase();
  return (
    <span className="u-stack u-gap-1">
      <label className="admin-label" htmlFor={`rate-${itemId}`}>
        Rate: VND per 1 {code}
      </label>
      <span className="u-row u-gap-1">
        <input
          id={`rate-${itemId}`}
          className="admin-input u-tabular"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="18,426"
        />
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={saving || !rate.trim()} onClick={save}>
          {saving ? "Saving…" : "Use this rate"}
        </button>
        {!ratePending && (
          <button type="button" className="admin-btn admin-btn--sm" disabled={saving} onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
      </span>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}
