"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteLead } from "@/entities/crm/routes/admin/(dashboard)/revenue/leads/actions";

// Shown when the person isn't already being worked: promotes into the SDR
// queue (lifecycle_stage='lead', lead_status='new') and appends a transition.
export function PromoteButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="u-row">
      {error && <span className="admin-cell-muted">{error}</span>}
      <button
        type="button"
        className="admin-btn admin-btn--primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await promoteLead(personId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Promoting…" : "Promote to lead"}
      </button>
    </span>
  );
}
