"use client";

// The fields a training is made of (TR.2), shared by the member's Log a training
// and the organiser's Schedule a training so the two forms can never ask
// differently: type, title, date, start, length and notes. Times are Vietnam time.
import type { ChangeEvent } from "react";

export type TrainingDraft = { typeId: string; title: string; date: string; start: string; minutes: number; notes: string };

export const LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const;
const lengthText = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

export function TrainingFields({
  draft,
  onChange,
  types,
  timeLocked = false,
}: {
  draft: TrainingDraft;
  onChange: (next: TrainingDraft) => void;
  types: { id: string; name: string }[];
  // After a training starts only its title and notes may change.
  timeLocked?: boolean;
}) {
  const set = (k: keyof TrainingDraft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...draft, [k]: k === "minutes" ? Number(e.target.value) : e.target.value });
  return (
    <div className="admin-form">
      <label className="admin-field">
        <span className="admin-label">Type</span>
        <select className="admin-select" value={draft.typeId} onChange={set("typeId")} disabled={timeLocked} required>
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
        <input className="admin-input" value={draft.title} onChange={set("title")} maxLength={200} placeholder="Workshop: writing evals for an agent" required />
      </label>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Date</span>
          <input className="admin-input" type="date" value={draft.date} onChange={set("date")} disabled={timeLocked} required />
        </label>
        <label className="admin-field">
          <span className="admin-label">Starts (Vietnam time)</span>
          <input className="admin-input" type="time" value={draft.start} onChange={set("start")} disabled={timeLocked} required />
        </label>
        <label className="admin-field">
          <span className="admin-label">Length</span>
          <select className="admin-select" value={draft.minutes} onChange={set("minutes")} disabled={timeLocked}>
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {lengthText(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {timeLocked && <p className="admin-hint">It has started, so only the title and notes can change.</p>}
      <label className="admin-field">
        <span className="admin-label">Notes · optional</span>
        <textarea className="admin-textarea" rows={3} value={draft.notes} onChange={set("notes")} maxLength={2000} />
      </label>
    </div>
  );
}

/** A draft as the actions take it: blank notes are left out. */
export function draftInput(d: TrainingDraft) {
  return { typeId: d.typeId, title: d.title, date: d.date, start: d.start, minutes: d.minutes, ...(d.notes.trim() ? { notes: d.notes } : {}) };
}
