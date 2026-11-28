"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { timeAgo } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { restoreHeldInquiry } from "@/entities/crm/lib/inquiry-triage-actions";
import type { HeldInquiry } from "@/entities/crm/lib/inquiry-triage-shapes";

// "Held as spam by the qualifier" (Z.11, decision 1): every inquiry the
// qualifier read as spam waits here, the latest twenty, until someone restores
// it. Restore puts it back in New and changes nothing else; Promote works from
// there as it always has. Nothing held is posted to the chat (decision 13), so
// this strip is the record of every hold.

export function HeldStrip({ held, error, may }: { held: HeldInquiry[]; error: string | null; may: MayProp }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function restore(id: string) {
    setMessage(null);
    startTransition(async () => {
      const r = await restoreHeldInquiry(id);
      if (!r.ok) setMessage(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="admin-held-strip" aria-label="Held as spam by the qualifier">
      <div className="admin-lead-read-head">
        <span className="admin-lead-section-label">Held as spam by the qualifier · {held.length}</span>
        <span className="admin-cell-muted">The latest 20. Nothing held is posted to the chat.</span>
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {!error && held.length === 0 && (
        <p className="admin-lead-read-line">Nothing is held. Every inquiry the qualifier reads as spam waits here until someone restores it.</p>
      )}
      {held.map((h) => (
        <div key={h.inquiryId} className="admin-held-row">
          <div className="admin-held-row-main">
            <span className="admin-cell-strong">{h.name}</span>
            {h.heldAt && <span className="admin-cell-muted"> · held {timeAgo(h.heldAt)}</span>}
            {h.reason && <div className="admin-cell-muted u-truncate">{h.reason}</div>}
          </div>
          {may["crm.pipeline"] === true && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => restore(h.inquiryId)}>
              Restore
            </button>
          )}
        </div>
      ))}
      {message && <div className="admin-alert admin-alert--err u-mt-1">{message}</div>}
    </section>
  );
}
