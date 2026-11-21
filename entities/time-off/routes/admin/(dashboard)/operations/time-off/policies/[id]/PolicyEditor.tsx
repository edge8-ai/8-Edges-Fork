"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ACCRUAL_CADENCES,
  CADENCE_LABEL,
  COUNTS_FROM,
  COUNTS_FROM_LABEL,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  YEAR_BASES,
  YEAR_BASIS_LABEL,
  type LeavePolicySummary,
} from "@/entities/time-off/client";
import { savePolicy, type PolicyInput } from "./actions";

// Edits the rules the balance arithmetic reads and the text every surface
// shows. Tiers are edited as rows (service year from, days a year) and stored
// in hours; the server action validates everything again before writing.
type TierDraft = { fromYear: string; daysPerYear: string };

export function PolicyEditor({ policy }: { policy: LeavePolicySummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const a = policy.accrual;

  const [name, setName] = useState(policy.name);
  const [yearBasis, setYearBasis] = useState<string>(a.yearBasis);
  const [cadence, setCadence] = useState<string>(a.cadence);
  const [hoursPerDay, setHoursPerDay] = useState(String(a.hoursPerDay));
  const [minIncrementHours, setMinIncrementHours] = useState(String(a.minIncrementHours));
  const [carryCap, setCarryCap] = useState(a.carryCapHours === null ? "" : String(a.carryCapHours));
  const [bank, setBank] = useState<string[]>(a.bankLeaveTypes);
  const [honour, setHonour] = useState(policy.honourImportedBalance);
  const [countsFrom, setCountsFrom] = useState<string>(policy.countsFrom);
  const [text, setText] = useState(policy.policyText ?? "");
  const [tiers, setTiers] = useState<TierDraft[]>(
    a.tiers.length > 0
      ? a.tiers.map((t) => ({ fromYear: String(t.fromYear), daysPerYear: String(t.hoursPerYear / a.hoursPerDay) }))
      : [{ fromYear: "1", daysPerYear: "" }],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    const hpd = Number(hoursPerDay);
    const input: PolicyInput = {
      name: name.trim(),
      yearBasis,
      cadence,
      hoursPerDay: hpd,
      minIncrementHours: Number(minIncrementHours),
      carryCapHours: carryCap.trim() === "" ? null : Number(carryCap),
      bankLeaveTypes: bank,
      honourImportedBalance: honour,
      countsFrom,
      policyText: text,
      tiers: tiers
        .filter((t) => t.fromYear.trim() !== "" || t.daysPerYear.trim() !== "")
        .map((t) => ({ fromYear: Number(t.fromYear), hoursPerYear: Number(t.daysPerYear) * hpd })),
    };
    startTransition(async () => {
      const res = await savePolicy(policy.id, input);
      if (res.ok) {
        setBanner({ tone: "ok", text: "Policy saved. Every balance on this policy now follows these rules." });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  function toggleBank(type: string) {
    setBank((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]));
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      {banner && (
        <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>{banner.text}</div>
      )}

      <div className="admin-field">
        <label className="admin-label" htmlFor="lp-name">Name</label>
        <input id="lp-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="admin-timeoff-grid">
        <div className="admin-field">
          <label className="admin-label" htmlFor="lp-basis">Leave year</label>
          <select id="lp-basis" className="admin-select" value={yearBasis} onChange={(e) => setYearBasis(e.target.value)}>
            {YEAR_BASES.map((b) => (
              <option key={b} value={b}>{YEAR_BASIS_LABEL[b]}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="lp-cadence">Accrual</label>
          <select id="lp-cadence" className="admin-select" value={cadence} onChange={(e) => setCadence(e.target.value)}>
            {ACCRUAL_CADENCES.map((c) => (
              <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-timeoff-grid">
        <div className="admin-field">
          <label className="admin-label" htmlFor="lp-hpd">Hours in a day</label>
          <input id="lp-hpd" className="admin-input" type="number" min={1} step="0.5" value={hoursPerDay} onChange={(e) => setHoursPerDay(e.target.value)} required />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="lp-inc">Smallest unit (hours)</label>
          <input id="lp-inc" className="admin-input" type="number" min={0.5} step="0.5" value={minIncrementHours} onChange={(e) => setMinIncrementHours(e.target.value)} required />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="lp-cap">Carry-over cap (hours)</label>
          <input id="lp-cap" className="admin-input" type="number" min={0} step="1" value={carryCap} placeholder="blank = no limit" onChange={(e) => setCarryCap(e.target.value)} />
        </div>
      </div>

      <div className="admin-field">
        <span className="admin-label">Entitlement by service year</span>
        <p className="admin-cell-muted u-mb-1">Days a year from the given service year onward. Year 1 starts the day probation ends.</p>
        {tiers.map((t, i) => (
          <div className="admin-form-row" key={i}>
            <label className="admin-label u-w-120" htmlFor={`lp-tier-year-${i}`}>From year</label>
            <input
              id={`lp-tier-year-${i}`}
              className="admin-input admin-input--w-xs"
              type="number"
              min={1}
              step="1"
              value={t.fromYear}
              onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, fromYear: e.target.value } : x)))}
            />
            <label className="admin-label u-w-120" htmlFor={`lp-tier-days-${i}`}>Days a year</label>
            <input
              id={`lp-tier-days-${i}`}
              className="admin-input admin-input--w-sm"
              type="number"
              min={0}
              step="0.5"
              value={t.daysPerYear}
              onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, daysPerYear: e.target.value } : x)))}
            />
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              disabled={tiers.length === 1}
              onClick={() => setTiers((cur) => cur.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setTiers((cur) => [...cur, { fromYear: "", daysPerYear: "" }])}>
            Add a tier
          </button>
        </div>
      </div>

      <div className="admin-field">
        <span className="admin-label">Leave types that draw from this bank</span>
        <div className="u-row u-wrap u-gap-4">
          {LEAVE_TYPES.map((t) => (
            <label key={t} className="admin-label--check">
              <input type="checkbox" checked={bank.includes(t)} onChange={() => toggleBank(t)} /> {LEAVE_TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label" htmlFor="lp-counts-from">Accrual and the leave year count from</label>
        <select id="lp-counts-from" className="admin-select" value={countsFrom} onChange={(e) => setCountsFrom(e.target.value)}>
          {COUNTS_FROM.map((c) => (
            <option key={c} value={c}>
              {COUNTS_FROM_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <label className="admin-label--check">
        <input type="checkbox" checked={honour} onChange={(e) => setHonour(e.target.checked)} />
        Start each member from the opening balance imported on 6 July 2026 (for policies whose opening figures were reconciled with the client)
      </label>

      <div className="admin-field">
        <label className="admin-label" htmlFor="lp-text">Policy text</label>
        <p className="admin-cell-muted u-mb-1">Shown to the team and the client exactly as written. Blank lines separate paragraphs.</p>
        <textarea id="lp-text" className="admin-textarea admin-textarea--grow" rows={12} value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Saving…" : "Save policy"}
        </button>
      </div>
    </form>
  );
}
