"use client";

// The fields a training plan is made of (TR.5): type, title, the weekdays it
// meets, start and end time, and the Lark meeting title its recordings are
// found under. Shared by New plan and Edit plan so the two forms cannot ask
// differently. Times are Vietnam time.
import type { ChangeEvent } from "react";

export type PlanDraft = { typeId: string; title: string; weekdays: number[]; start: string; end: string; larkTitle: string };

const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

export const EMPTY_PLAN: PlanDraft = { typeId: "", title: "", weekdays: [], start: "14:00", end: "15:15", larkTitle: "" };

export function PlanFields({ draft, onChange, types }: { draft: PlanDraft; onChange: (next: PlanDraft) => void; types: { id: string; name: string }[] }) {
  const set = (k: keyof PlanDraft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...draft, [k]: e.target.value });
  const toggleDay = (n: number) => onChange({ ...draft, weekdays: draft.weekdays.includes(n) ? draft.weekdays.filter((d) => d !== n) : [...draft.weekdays, n] });
  return (
    <div className="admin-form">
      <label className="admin-field">
        <span className="admin-label">Type</span>
        <select className="admin-select" value={draft.typeId} onChange={set("typeId")} required>
          <option value="">Pick a type</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-field">
        <span className="admin-label">Title</span>
        <input className="admin-input" value={draft.title} onChange={set("title")} maxLength={200} placeholder="English Communication Practice" required />
      </label>
      <div className="admin-field">
        <span className="admin-label">Meets on</span>
        <div className="tr-chips" role="group" aria-label="Weekdays">
          {DAYS.map((d) => (
            <button key={d.n} type="button" className={`tr-chip${draft.weekdays.includes(d.n) ? " is-on" : ""}`} aria-pressed={draft.weekdays.includes(d.n)} onClick={() => toggleDay(d.n)}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Starts (Vietnam time)</span>
          <input className="admin-input" type="time" value={draft.start} onChange={set("start")} required />
        </label>
        <label className="admin-field">
          <span className="admin-label">Ends</span>
          <input className="admin-input" type="time" value={draft.end} onChange={set("end")} required />
        </label>
      </div>
      <label className="admin-field">
        <span className="admin-label">Lark meeting title · optional</span>
        <input className="admin-input" value={draft.larkTitle} onChange={set("larkTitle")} maxLength={200} placeholder="The title the sessions are recorded under" />
        <span className="admin-hint">Recorded sessions are found by this title, once the pickup ships.</span>
      </label>
    </div>
  );
}

/** A draft as the actions take it. */
export function planInput(d: PlanDraft) {
  return {
    typeId: d.typeId,
    title: d.title,
    rhythm: { weekdays: d.weekdays, start: d.start, end: d.end },
    ...(d.larkTitle.trim() ? { larkTitle: d.larkTitle.trim() } : {}),
  };
}
