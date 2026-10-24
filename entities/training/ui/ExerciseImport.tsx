"use client";

// The library's import panel (English Program PR 2): paste a document, let
// Claude split it into draft rows, tick what to keep, edit inline, confirm.
// Nothing saves until the organiser confirms.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { SIDES, SIDE_LABEL, type ExerciseDraft, type Side } from "@/entities/training/lib/exercise-rules";
import type { ImportResult } from "@/entities/training/lib/exercises";
import { ActionNote } from "./ActionNote";

export function ExerciseImport({
  plans,
  split,
  confirm,
  onDone,
}: {
  plans: { id: string; title: string }[];
  split: (input: unknown) => Promise<ImportResult>;
  confirm: (input: unknown) => Promise<Result>;
  onDone: () => void;
}) {
  const [document, setDocument] = useState("");
  const [planId, setPlanId] = useState("");
  const [drafts, setDrafts] = useState<ExerciseDraft[] | null>(null);
  const { note, pending, run } = useActionRunner();
  const setRow = (i: number, patch: Partial<ExerciseDraft>) => setDrafts((ds) => (ds ? ds.map((d, j) => (j === i ? { ...d, ...patch } : d)) : ds));
  const doSplit = () =>
    run(
      async () => {
        const res = await split({ document, planId: planId || null });
        if (res.ok) setDrafts(res.drafts);
        return res;
      },
      "Split into rows. Tick what to keep, then confirm.",
    );
  const doConfirm = () => {
    const keep = (drafts ?? []).filter((d) => d.keep).map(({ keep: _k, ...d }) => d);
    return run(() => confirm({ drafts: keep }), `Added ${keep.length} ${keep.length === 1 ? "exercise" : "exercises"}.`, onDone);
  };
  const kept = drafts?.filter((d) => d.keep).length ?? 0;

  return (
    <section className="admin-card admin-section-card tr-card" aria-label="Paste to import">
      <h2 className="tr-card-title">Paste to import</h2>
      <p className="tr-hint">Paste a document of activities. Claude splits it into draft rows with side, skills and minutes guessed. Nothing saves until you confirm.</p>
      {drafts === null ? (
        <div className="admin-form">
          <textarea className="admin-textarea" rows={8} value={document} onChange={(e) => setDocument(e.target.value)} placeholder="Paste the document here" aria-label="Document" />
          <label className="admin-field tr-publish-field">
            <span className="admin-label">For</span>
            <select className="admin-select" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Shared across plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-form-actions">
            <ActionNote note={note} />
            <button type="button" className="admin-btn admin-btn--primary" onClick={doSplit} disabled={pending || !document.trim()}>
              {pending ? "Splitting…" : "Split into rows"}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-form">
          <ul className="tr-drafts">
            {drafts.map((d, i) => (
              <li key={i} className={`tr-draft${d.keep ? "" : " is-skipped"}`}>
                <label className="tr-draft-keep">
                  <input type="checkbox" checked={d.keep} onChange={(e) => setRow(i, { keep: e.target.checked })} aria-label={`Keep ${d.title}`} />
                </label>
                <div className="tr-draft-fields">
                  <input className="admin-input" value={d.title} onChange={(e) => setRow(i, { title: e.target.value })} aria-label="Title" />
                  <div className="tr-draft-row">
                    <select className="admin-select" value={d.side} onChange={(e) => setRow(i, { side: e.target.value as Side })} aria-label="Side">
                      {SIDES.map((s) => (
                        <option key={s} value={s}>
                          {SIDE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <input className="admin-input" value={d.skills.join(", ")} onChange={(e) => setRow(i, { skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="skills" aria-label="Skills" />
                    <input className="admin-input" value={d.format ?? ""} onChange={(e) => setRow(i, { format: e.target.value || null })} placeholder="format" aria-label="Format" />
                    <input className="admin-input tr-min" type="number" min={1} value={d.minutesMin} onChange={(e) => setRow(i, { minutesMin: Number(e.target.value) })} aria-label="Shortest minutes" />
                    <input className="admin-input tr-min" type="number" min={1} value={d.minutesMax} onChange={(e) => setRow(i, { minutesMax: Number(e.target.value) })} aria-label="Longest minutes" />
                  </div>
                  <textarea className="admin-textarea" rows={2} value={d.instructions ?? ""} onChange={(e) => setRow(i, { instructions: e.target.value || null })} aria-label="Instructions" />
                </div>
              </li>
            ))}
          </ul>
          <div className="admin-form-actions">
            <ActionNote note={note} />
            <button type="button" className="admin-btn" onClick={() => setDrafts(null)} disabled={pending}>
              Back
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={doConfirm} disabled={pending || kept === 0}>
              Add {kept} ticked
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
