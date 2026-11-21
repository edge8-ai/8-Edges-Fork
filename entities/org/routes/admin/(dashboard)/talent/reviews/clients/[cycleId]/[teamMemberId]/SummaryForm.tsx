"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { saveSummaryAction } from "../owner-actions";

// The owner's HR summary of one member's review (CR.3.3, story 50). Editable
// until release, then shown as it was released: the member reads exactly what
// was there at that moment (the CR.3.1 prototype as approved).
export function SummaryForm({
  may,
  cycleId,
  teamMemberId,
  memberName,
  initial,
  canEdit,
}: {
  may: MayProp;
  cycleId: string;
  teamMemberId: string;
  memberName: string;
  initial: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = canEdit && may["org.reviews"];

  function save() {
    setStatus(null);
    startTransition(async () => {
      const r = await saveSummaryAction({ cycleId, teamMemberId, summary: text });
      setStatus(r.ok ? "Saved" : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <section className="admin-card u-p-4" aria-labelledby="cr-summary">
      <h2 id="cr-summary" className="admin-card-title admin-card-title--tight">
        HR summary
      </h2>
      <p className="admin-hint u-mt-0">
        {editable ? `Optional. ${memberName} reads it after release, beside both parts.` : canEdit ? "" : "Released with this summary."}
      </p>
      {editable ? (
        <>
          <label className="admin-field u-mt-2">
            <span className="admin-label">Your summary of {memberName}&apos;s review</span>
            <textarea className="admin-input admin-textarea--grow" rows={7} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="u-row u-between u-gap-2 u-mt-2">
            <span className="admin-hint u-m-0" role="status">
              {status ?? (text !== initial ? "Not saved yet" : "")}
            </span>
            <button type="button" className="admin-btn admin-btn--sm" onClick={save} disabled={pending || text === initial}>
              {pending ? "Saving…" : "Save summary"}
            </button>
          </div>
        </>
      ) : initial ? (
        <p className="u-m-0 u-prewrap">{initial}</p>
      ) : (
        <p className="admin-hint u-m-0">No summary was written.</p>
      )}
    </section>
  );
}
