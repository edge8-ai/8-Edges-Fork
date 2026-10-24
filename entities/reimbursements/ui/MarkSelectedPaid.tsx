"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatVndWhole } from "@/kernel/ui/format";
import { RecordPayment, type PayablePayment, type PayerActions } from "./RecordPayment";

// "Mark selected paid" (decision 4): not one click for many people, because
// each transfer has its own bank receipt that goes back to that person. The
// payer ticks the people they have paid, then records each one in turn, with
// that person's receipt and the VND sent; a person can be skipped and recorded
// later. It is a sequence of the same single-payment action, never a bulk write.
export function MarkSelectedPaid({ payments, actions }: { payments: PayablePayment[]; actions: PayerActions }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<PayablePayment[] | null>(null);
  const [recorded, setRecorded] = useState(0);

  if (payments.length < 2) return null;

  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const next = (counted: boolean) => {
    if (counted) setRecorded((n) => n + 1);
    const rest = (queue ?? []).slice(1);
    setQueue(rest.length > 0 ? rest : null);
    if (rest.length === 0) router.refresh();
  };

  if (queue && queue[0]) {
    const current = queue[0];
    return (
      <section className="admin-card admin-section-card">
        <div className="u-row u-between u-items-center u-wrap u-gap-1">
          <strong>
            Recording {current.personName}: {formatVndWhole(current.amountVnd)}
          </strong>
          <span className="admin-hint">
            {queue.length} to go{recorded > 0 ? ` · ${recorded} recorded` : ""}
          </span>
        </div>
        <RecordPayment key={current.id} payment={current} actions={actions} allowReturn={false} onDone={() => next(true)} />
        <div className="u-row u-gap-1 u-mt-1">
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => next(false)}>
            Skip {current.personName} for now
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm admin-btn--ghost"
            onClick={() => {
              setQueue(null);
              router.refresh();
            }}
          >
            Stop
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-card admin-section-card">
      <div className="u-stack u-gap-1">
        <span className="admin-label">Paid several people? Tick them, then record each one with its receipt.</span>
        <div className="u-row u-gap-2 u-wrap">
          {payments.map((p) => (
            <label key={p.id} className="u-row u-gap-1 u-items-center">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              {p.personName} · {formatVndWhole(p.amountVnd)}
            </label>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="admin-btn"
            disabled={picked.size === 0}
            onClick={() => {
              setRecorded(0);
              setQueue(payments.filter((p) => picked.has(p.id)));
            }}
          >
            Mark selected paid{picked.size > 0 ? ` (${picked.size})` : ""}
          </button>
        </div>
      </div>
    </section>
  );
}
