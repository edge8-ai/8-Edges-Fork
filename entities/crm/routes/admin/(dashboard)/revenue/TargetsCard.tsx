"use client";

import { useState, useTransition } from "react";
import { setRevenueTarget } from "./targets-actions";

// The company's targets, editable in place, for whichever period the switch
// is on (RF-6). One row per metric; a blank amount removes the target.
// Everything here is a figure for the company: the card has no notion of a
// person, and the input schema behind it has nowhere to put one.

export type TargetView = { metric: string; label: string; money: boolean; periodKind: string; periodStart: string; amount: number | null; note: string | null };
export type TargetPeriod = { kind: string; label: string; rows: TargetView[] };

export function TargetsCard({ periods }: { periods: TargetPeriod[] }) {
  const [kind, setKind] = useState(periods[0]?.kind ?? "month");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const period = periods.find((p) => p.kind === kind) ?? periods[0];
  const rows = period?.rows ?? [];
  // Keyed by period AND metric, so switching to the quarter shows the
  // quarter's amounts rather than carrying the month's into its inputs.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(periods.flatMap((p) => p.rows.map((r) => [`${p.kind}:${r.metric}`, r.amount == null ? "" : String(r.amount)]))),
  );
  const valueOf = (metric: string) => values[`${kind}:${metric}`] ?? "";

  function switchTo(next: string) {
    setKind(next);
    setEditing(false);
    setNote(null);
  }

  function save() {
    setNote(null);
    start(async () => {
      for (const r of rows) {
        const raw = valueOf(r.metric);
        const amount = raw.trim() === "" ? 0 : Number(raw.replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(amount)) {
          setNote(`${r.label}: not a number.`);
          return;
        }
        if ((r.amount ?? 0) === amount) continue;
        const res = await setRevenueTarget({ metric: r.metric, periodKind: r.periodKind, periodStart: r.periodStart, amount, note: r.note });
        if (!res.ok) {
          setNote(`${r.label}: ${res.error}`);
          return;
        }
      }
      setNote("Targets saved.");
      setEditing(false);
    });
  }

  return (
    <section className="dash-card dash-span-12">
      <div className="dash-card-head">
        <h3 className="dash-card-title">Targets · {period?.label ?? ""}</h3>
        <span className="dash-card-meta">
          <span className="dash-sorts" role="group" aria-label="Target period">
            {periods.map((p) => (
              <button key={p.kind} type="button" className={p.kind === kind ? "is-on" : undefined} onClick={() => switchTo(p.kind)} disabled={pending}>
                {p.kind[0].toUpperCase() + p.kind.slice(1)}
              </button>
            ))}
          </span>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
            {editing ? "Close" : "Edit"}
          </button>
        </span>
      </div>
      <div className="dash-card-body">
        {!editing ? (
          <div className="admin-summary-pills">
            {rows.map((r) => (
              <span key={r.metric} className="admin-pill">
                <span className="admin-pill-label">{r.label}</span>
                <span className="admin-pill-val">{r.amount == null ? "—" : r.money ? `$${r.amount.toLocaleString("en-US")}` : r.amount.toLocaleString("en-US")}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="dash-form">
            {rows.map((r) => (
              <div key={r.metric} className="admin-field">
                <label className="admin-label" htmlFor={`t-${r.metric}`}>
                  {r.label}
                </label>
                <input
                  id={`t-${r.metric}`}
                  className="admin-input"
                  inputMode="numeric"
                  value={valueOf(r.metric)}
                  onChange={(e) => setValues((v) => ({ ...v, [`${kind}:${r.metric}`]: e.target.value }))}
                  placeholder={r.money ? "whole dollars" : "count"}
                />
              </div>
            ))}
            <div className="admin-field">
              <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save targets"}
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="dash-card-note">{note ?? "Company-level figures the tiles compare against. A blank amount removes a target. There are no per-person targets here, by design."}</p>
    </section>
  );
}
