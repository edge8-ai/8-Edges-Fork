"use client";

// One exercise's fields (English Program PR 2), inside the library's drawer:
// title, side, skills, format, the time range, instructions, a link, which
// plan it belongs to and whether it works as homework.
import { SIDES, SIDE_LABEL, type Exercise, type Side } from "@/entities/training/lib/exercise-rules";

export type ExerciseFormDraft = {
  title: string;
  side: Side;
  skills: string;
  format: string;
  minutesMin: number;
  minutesMax: number;
  instructions: string;
  materialsUrl: string;
  homeworkAble: boolean;
  planId: string;
};

export const EMPTY: ExerciseFormDraft = { title: "", side: "presentation", skills: "", format: "", minutesMin: 10, minutesMax: 15, instructions: "", materialsUrl: "", homeworkAble: false, planId: "" };

/** A draft as the actions take it. */
export const toInput = (d: ExerciseFormDraft) => ({
  title: d.title,
  side: d.side,
  skills: d.skills.split(",").map((s) => s.trim()).filter(Boolean),
  format: d.format,
  minutesMin: d.minutesMin,
  minutesMax: d.minutesMax,
  instructions: d.instructions,
  materialsUrl: d.materialsUrl,
  homeworkAble: d.homeworkAble,
  planId: d.planId || null,
});

export const fromExercise = (e: Exercise): ExerciseFormDraft => ({
  title: e.title,
  side: e.side,
  skills: e.skills.join(", "),
  format: e.format ?? "",
  minutesMin: e.minutesMin,
  minutesMax: e.minutesMax,
  instructions: e.instructions ?? "",
  materialsUrl: e.materialsUrl ?? "",
  homeworkAble: e.homeworkAble,
  planId: e.planId ?? "",
});

export function ExerciseForm({
  draft,
  onChange,
  plans,
}: {
  draft: ExerciseFormDraft;
  onChange: (next: ExerciseFormDraft) => void;
  plans: { id: string; title: string }[];
}) {
  const set = <K extends keyof ExerciseFormDraft>(k: K, v: ExerciseFormDraft[K]) => onChange({ ...draft, [k]: v });
  return (
    <div className="admin-form">
      <label className="admin-field">
        <span className="admin-label">Title</span>
        <input className="admin-input" value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={200} required />
      </label>
      <div className="admin-field">
        <span className="admin-label">Side</span>
        <div className="tr-chips" role="group" aria-label="Side">
          {SIDES.map((s) => (
            <button key={s} type="button" className={`tr-chip${draft.side === s ? " is-on" : ""}`} aria-pressed={draft.side === s} onClick={() => set("side", s)}>
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Skills · comma separated</span>
          <input className="admin-input" value={draft.skills} onChange={(e) => set("skills", e.target.value)} placeholder="pronunciation, clarifying questions" />
        </label>
        <label className="admin-field">
          <span className="admin-label">Format</span>
          <input className="admin-input" value={draft.format} onChange={(e) => set("format", e.target.value)} placeholder="drill, roleplay, pair, solo" maxLength={40} />
        </label>
      </div>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Shortest (min)</span>
          <input className="admin-input" type="number" min={1} value={draft.minutesMin} onChange={(e) => set("minutesMin", Number(e.target.value))} />
        </label>
        <label className="admin-field">
          <span className="admin-label">Longest (min)</span>
          <input className="admin-input" type="number" min={1} value={draft.minutesMax} onChange={(e) => set("minutesMax", Number(e.target.value))} />
        </label>
      </div>
      <label className="admin-field">
        <span className="admin-label">Instructions for the teacher</span>
        <textarea className="admin-textarea" rows={4} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={5000} placeholder="What to say, what to watch for." />
      </label>
      <label className="admin-field">
        <span className="admin-label">Materials link · optional</span>
        <input className="admin-input" value={draft.materialsUrl} onChange={(e) => set("materialsUrl", e.target.value)} maxLength={500} />
      </label>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">For</span>
          <select className="admin-select" value={draft.planId} onChange={(e) => set("planId", e.target.value)}>
            <option value="">Shared across plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="tr-sign">
          <input type="checkbox" checked={draft.homeworkAble} onChange={(e) => set("homeworkAble", e.target.checked)} /> Works as homework
        </label>
      </div>
    </div>
  );
}
