"use client";

// The session plan editor (English Program PR 3): the blocks in order, each a
// library exercise or a free line with its minutes and side; the minutes split
// against the programme's halves; Claude's reasoning line; Save, Mark checked
// and Redraft. Materials are links the learners see. Who has handed in the
// homework is shown as submitted or not, never the content.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { Result } from "@/kernel/data/result";
import { BLOCK_SIDES, PLAN_STATE_LABEL, splitMinutes, type BlockInputType, type BlockSide, type PlanState, type SessionBlock } from "@/entities/training/lib/session-plan-rules";
import { minutesBetween } from "@/entities/training/lib/training-format";
import { ActionNote } from "./ActionNote";

type Library = { id: string; title: string; side: BlockSide; minutesMin: number; minutesMax: number }[];
type Material = { label: string; url: string };

export function BlocksEditor({
  session,
  blocks: initial,
  library,
  homework,
  actions,
}: {
  session: { id: string; startsAt: string; endsAt: string; state: "upcoming" | "started" | "cancelled"; mayEdit: boolean; planState: PlanState; planReasoning: string | null; materials: Material[] };
  blocks: SessionBlock[];
  library: Library;
  homework: { name: string; submitted: boolean }[];
  actions: {
    save: (id: string, input: unknown) => Promise<Result>;
    check: (id: string) => Promise<Result>;
    redraft: (id: string) => Promise<Result>;
    materials: (id: string, input: unknown) => Promise<Result>;
  };
}) {
  const [blocks, setBlocks] = useState<BlockInputType[]>(initial.map(({ exerciseTitle: _t, ...b }) => b));
  const [materials, setMaterials] = useState<Material[]>(session.materials);
  const { note, pending, run } = useActionRunner();
  const titleOf = (id: string | null) => (id ? (library.find((e) => e.id === id)?.title ?? "A retired exercise") : null);
  const split = splitMinutes(blocks);
  const length = minutesBetween(session.startsAt, session.endsAt);
  const set = (i: number, patch: Partial<BlockInputType>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, by: -1 | 1) =>
    setBlocks((bs) => {
      const j = i + by;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const addFromLibrary = (id: string) => {
    const e = library.find((x) => x.id === id);
    if (e) setBlocks((bs) => [...bs, { side: e.side, exerciseId: e.id, text: null, minutes: e.minutesMin }]);
  };
  const addFree = () => setBlocks((bs) => [...bs, { side: "reactive", exerciseId: null, text: "", minutes: 10 }]);
  const save = () => run(() => actions.save(session.id, { blocks }), "Plan saved and checked.");
  const check = () => run(() => actions.check(session.id), "Marked checked.");
  const redraft = async () => actions.redraft(session.id);

  return (
    <>
      <ActionNote note={note} />
      <section className="admin-card admin-section-card tr-card" aria-label="Session plan">
        <div className="tr-card-head">
          <div>
            <h2 className="tr-card-title">Session plan · {PLAN_STATE_LABEL[session.planState]}</h2>
            <p className="tr-hint">
              presentation {split.presentation} min · reactive {split.reactive} min · {split.total} of {length} min{split.total > 0 ? ` · ${split.presentationPercent}% presentation` : ""}
            </p>
          </div>
          {session.mayEdit && (
            <div className="tr-row-actions">
              <ConfirmButton className="admin-btn admin-btn--sm" label="Redraft" title="Redraft with Claude?" body="Replaces every block with a fresh draft. Your edits here are lost." confirmLabel="Redraft" onConfirm={redraft} />
              {session.planState === "drafted" && (
                <button type="button" className="admin-btn admin-btn--sm" onClick={check} disabled={pending}>
                  Mark checked
                </button>
              )}
            </div>
          )}
        </div>
        {session.planReasoning && (
          <p className="tr-reasoning">
            <span className="tr-label">Why these</span>
            {session.planReasoning}
          </p>
        )}
        {blocks.length === 0 ? <p className="tr-hint">No blocks yet. Add from the library or a free block, or wait for the morning draft.</p> : null}
        <ol className="tr-blocks">
          {blocks.map((b, i) => (
            <li key={i} className={`tr-block ${b.side === "reactive" ? "tr-type-2" : "tr-type-1"}`}>
              <div className="tr-block-order">
                <button type="button" className="admin-btn admin-btn--sm tr-btn-quiet" onClick={() => move(i, -1)} disabled={i === 0 || !session.mayEdit} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="admin-btn admin-btn--sm tr-btn-quiet" onClick={() => move(i, 1)} disabled={i === blocks.length - 1 || !session.mayEdit} aria-label="Move down">
                  ↓
                </button>
              </div>
              <div className="tr-block-main">
                {b.exerciseId ? (
                  <div className="tr-row-title">
                    {titleOf(b.exerciseId)} <span className="tr-phil-side">library</span>
                  </div>
                ) : (
                  <input className="admin-input" value={b.text ?? ""} onChange={(e) => set(i, { text: e.target.value })} placeholder="A free block, in your words" maxLength={500} disabled={!session.mayEdit} aria-label={`Block ${i + 1}`} />
                )}
                <div className="tr-block-row">
                  <select className="admin-select" value={b.side} onChange={(e) => set(i, { side: e.target.value as BlockSide })} disabled={!session.mayEdit} aria-label="Side">
                    {BLOCK_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input className="admin-input tr-min" type="number" min={1} value={b.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} disabled={!session.mayEdit} aria-label="Minutes" />
                  <span className="tr-row-meta">min</span>
                  {session.mayEdit && (
                    <button type="button" className="admin-btn admin-btn--sm tr-btn-quiet" onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {session.mayEdit && (
          <div className="tr-publish">
            <label className="admin-field tr-publish-field">
              <span className="admin-label">+ Block from library</span>
              <select className="admin-select" value="" onChange={(e) => addFromLibrary(e.target.value)} aria-label="Add from library">
                <option value="">Pick an exercise</option>
                {library.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.side} · {e.minutesMin}–{e.minutesMax} min
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="admin-btn" onClick={addFree}>
              + Free block
            </button>
            <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={pending}>
              Save plan
            </button>
          </div>
        )}
      </section>

      <section className="admin-card admin-section-card tr-card" aria-label="Materials">
        <h2 className="tr-card-title">Materials</h2>
        <p className="tr-hint">Links the learners see on their session page: slides, a doc, a recording.</p>
        <ul className="tr-phil-edit-lines">
          {materials.map((m, i) => (
            <li key={i} className="tr-material">
              <input className="admin-input" value={m.label} onChange={(e) => setMaterials((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Slides: session 2" maxLength={120} aria-label="Label" />
              <input className="admin-input" value={m.url} onChange={(e) => setMaterials((ms) => ms.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" maxLength={500} aria-label="Link" />
              <button type="button" className="admin-btn admin-btn--sm tr-btn-quiet" onClick={() => setMaterials((ms) => ms.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="tr-publish">
          <button type="button" className="admin-btn" onClick={() => setMaterials((ms) => [...ms, { label: "", url: "" }])} disabled={materials.length >= 20}>
            + Link
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => run(() => actions.materials(session.id, { materials }), "Materials saved.")} disabled={pending}>
            Save materials
          </button>
        </div>
      </section>

      {homework.length > 0 && (
        <section className="admin-card admin-section-card tr-card" aria-label="Homework">
          <h2 className="tr-card-title">Homework due for this session</h2>
          <ul className="tr-phil-lines">
            {homework.map((h) => (
              <li key={h.name}>
                {h.name}: {h.submitted ? "submitted" : "not yet"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
