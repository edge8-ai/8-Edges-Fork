"use client";

import { useState, useTransition } from "react";
import { CHASE_CHANNELS, type ChaseChannel } from "@/entities/crm/lib/revenue-metrics/collections-vocab";

// "Log a chase" on one overdue row (RF-5). The action arrives as a prop from
// the server page: a client door must never reach a "use server" module, and a
// small form that takes its action from above is how every other admin table
// here does it.
//
// The form asks for a channel, what happens next, and optionally by when. It
// never asks who — that is the whole point of the design.

export type ChaseResult = { ok: true } | { ok: false; error: string };
export type LogChaseAction = (input: { companyId: string; invoiceRef: string; channel: ChaseChannel; note: string; nextDate: string | null }) => Promise<ChaseResult>;

export function LogChase({ companyId, invoiceRef, logChase }: { companyId: string | null; invoiceRef: string; logChase: LogChaseAction }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ChaseChannel>(CHASE_CHANNELS[0]);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // An invoice whose QuickBooks customer was never mapped to a company has
  // nowhere to hang a chase. Saying so beats a button that fails on click.
  if (!companyId) return <span className="dash-chase-blocked" title="This invoice's QuickBooks customer is not mapped to a company yet.">no client mapped</span>;

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(true)}>
        Log a chase
      </button>
    );
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await logChase({ companyId: companyId as string, invoiceRef, channel, note, nextDate: nextDate || null });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setNote("");
      setNextDate("");
    });
  }

  return (
    <div className="dash-chase">
      <select className="admin-input admin-input--sm" value={channel} onChange={(e) => setChannel(e.target.value as ChaseChannel)} aria-label="How the client was chased">
        {CHASE_CHANNELS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input className="admin-input admin-input--sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happens next" aria-label="What happens next" />
      <input className="admin-input admin-input--sm" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-label="By when" />
      <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={save} disabled={pending || note.trim() === ""}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="admin-btn admin-btn--sm" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </button>
      {error && <span className="dash-chase-error">{error}</span>}
    </div>
  );
}
