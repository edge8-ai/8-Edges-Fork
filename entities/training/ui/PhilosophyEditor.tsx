"use client";

// The organiser's philosophy page (TR.5): every field editable, a list of
// "what good looks like" lines, and a seed panel that pastes a conversation
// transcript and lets Claude fill the fields as a draft. Nothing is written
// until Save.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { PhilosophyType } from "@/entities/training/lib/philosophy";
import { ActionNote } from "./ActionNote";

export const EMPTY_PHILOSOPHY: PhilosophyType = {
  purpose: "",
  halves: { presentation: "", reactive: "", split: 50 },
  group_for: "",
  one_on_one_for: "",
  pressure_rule: "",
  homework_rule: "",
  good_looks_like: [],
  source: "",
};

type Side = "presentation" | "reactive";

export function PhilosophyEditor({
  planId,
  planTitle,
  initial,
  actions,
}: {
  planId: string;
  planTitle: string;
  initial: PhilosophyType | null;
  actions: {
    seed: (input: unknown) => Promise<{ ok: true; draft: PhilosophyType } | { ok: false; error: string }>;
    save: (planId: string, input: unknown) => Promise<Result>;
  };
}) {
  const [p, setP] = useState<PhilosophyType>(initial ?? EMPTY_PHILOSOPHY);
  const [transcript, setTranscript] = useState("");
  const [seedOpen, setSeedOpen] = useState(initial === null);
  const [seeded, setSeeded] = useState(false);
  const { note, pending, run } = useActionRunner();

  const set = <K extends keyof PhilosophyType>(k: K, v: PhilosophyType[K]) => setP({ ...p, [k]: v });
  const setLine = (i: number, patch: Partial<{ line: string; side: Side }>) => set("good_looks_like", p.good_looks_like.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const seed = () =>
    run(
      async () => {
        const res = await actions.seed({ title: planTitle, transcript });
        if (res.ok) {
          setP(res.draft);
          setSeeded(true);
          setSeedOpen(false);
        }
        return res;
      },
      "Drafted. Read it through, then save.",
    );
  const save = () => run(() => actions.save(planId, p), "Saved.", () => setSeeded(false));

  return (
    <>
      <section className="admin-card admin-section-card tr-card" aria-label="Seed from a transcript">
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">{initial ? "Re-seed from a transcript" : "Seed from a transcript"}</h2>
            <p className="tr-hint">Paste the conversation about how the programme is taught. Claude fills every field as a draft; nothing is saved until you save it.</p>
          </div>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setSeedOpen((o) => !o)}>
            {seedOpen ? "Hide" : "Paste a transcript"}
          </button>
        </div>
        {seedOpen && (
          <div className="admin-form">
            <textarea className="admin-textarea" rows={8} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the transcript here" aria-label="Transcript" />
            <div className="admin-form-actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={seed} disabled={pending || !transcript.trim()}>
                {pending ? "Drafting…" : "Draft the philosophy"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Philosophy">
        <div className="tr-card-head">
          <h2 className="tr-card-title">Philosophy</h2>
          {seeded && <span className="tr-count">Draft · not saved</span>}
        </div>
        <div className="admin-form tr-phil-form">
          <Field label="Purpose" value={p.purpose} onChange={(v) => set("purpose", v)} rows={2} />
          <div className="admin-form-row">
            <Field label="Presentation half" value={p.halves.presentation} onChange={(v) => set("halves", { ...p.halves, presentation: v })} rows={3} />
            <Field label="Reactive half" value={p.halves.reactive} onChange={(v) => set("halves", { ...p.halves, reactive: v })} rows={3} />
          </div>
          <label className="admin-field tr-publish-field">
            <span className="admin-label">Presentation share of each session (%)</span>
            <input className="admin-input" type="number" min={0} max={100} value={p.halves.split} onChange={(e) => set("halves", { ...p.halves, split: Number(e.target.value) })} />
          </label>
          <Field label="Pressure" value={p.pressure_rule} onChange={(v) => set("pressure_rule", v)} rows={2} />
          <Field label="Group sessions are for" value={p.group_for} onChange={(v) => set("group_for", v)} rows={2} />
          <Field label="One-on-one sessions are for" value={p.one_on_one_for} onChange={(v) => set("one_on_one_for", v)} rows={2} />
          <Field label="Homework" value={p.homework_rule} onChange={(v) => set("homework_rule", v)} rows={2} />

          <div className="admin-field">
            <span className="admin-label">What good looks like</span>
            <ul className="tr-phil-edit-lines">
              {p.good_looks_like.map((l, i) => (
                <li key={i} className="tr-phil-edit-line">
                  <input className="admin-input" value={l.line} onChange={(e) => setLine(i, { line: e.target.value })} maxLength={2000} aria-label={`Line ${i + 1}`} />
                  <select className="admin-select" value={l.side} onChange={(e) => setLine(i, { side: e.target.value as Side })} aria-label={`Side of line ${i + 1}`}>
                    <option value="reactive">reactive</option>
                    <option value="presentation">presentation</option>
                  </select>
                  <button type="button" className="admin-btn admin-btn--sm tr-btn-quiet" onClick={() => set("good_looks_like", p.good_looks_like.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div>
              <button type="button" className="admin-btn admin-btn--sm" onClick={() => set("good_looks_like", [...p.good_looks_like, { line: "", side: "reactive" }])} disabled={p.good_looks_like.length >= 20}>
                + Line
              </button>
            </div>
          </div>

          <Field label="Source" value={p.source} onChange={(v) => set("source", v)} rows={1} />
          <div className="admin-form-actions">
            <ActionNote note={note} />
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
              Save
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Field({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <label className="admin-field">
      <span className="admin-label">{label}</span>
      <textarea className="admin-textarea" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} />
    </label>
  );
}
