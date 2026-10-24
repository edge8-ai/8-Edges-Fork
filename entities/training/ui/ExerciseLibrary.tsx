"use client";

// The exercise library page (English Program PR 2): the list with its filters,
// a drawer to add or change one exercise (ExerciseForm), and the import panel
// (ExerciseImport) that pastes a document and confirms the rows Claude split.
import { useMemo, useState } from "react";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { SIDES, SIDE_LABEL, filterExercises, type Exercise, type ExerciseFilters, type Side } from "@/entities/training/lib/exercise-rules";
import type { ImportResult } from "@/entities/training/lib/exercises";
import { ActionNote, DrawerFooter } from "./ActionNote";
import { EMPTY, ExerciseForm, fromExercise, toInput, type ExerciseFormDraft } from "./ExerciseForm";
import { ExerciseImport } from "./ExerciseImport";

const minutesLabel = (e: { minutesMin: number; minutesMax: number }) => (e.minutesMin === e.minutesMax ? `${e.minutesMin} min` : `${e.minutesMin}–${e.minutesMax} min`);

export function ExerciseLibrary({
  exercises,
  facets,
  plans,
  actions,
}: {
  exercises: Exercise[];
  facets: { skills: string[]; formats: string[] };
  plans: { id: string; title: string }[];
  actions: {
    add: (input: unknown) => Promise<Result>;
    update: (id: string, input: unknown) => Promise<Result>;
    retire: (id: string) => Promise<Result>;
    split: (input: unknown) => Promise<ImportResult>;
    confirm: (input: unknown) => Promise<Result>;
  };
}) {
  const [filters, setFilters] = useState<ExerciseFilters>({ side: "", skill: "", format: "", q: "" });
  const [showRetired, setShowRetired] = useState(false);
  const [editing, setEditing] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(null);
  const [draft, setDraft] = useState<ExerciseFormDraft>(EMPTY);
  const [importOpen, setImportOpen] = useState(false);
  const { note, setNote, pending, run } = useActionRunner();

  const shown = useMemo(() => filterExercises(exercises.filter((e) => showRetired || !e.archived), filters), [exercises, filters, showRetired]);
  const planTitle = (id: string | null) => (id ? (plans.find((p) => p.id === id)?.title ?? "a plan") : "shared");
  const close = () => setEditing(null);
  const openNew = () => {
    setDraft(EMPTY);
    setNote(null);
    setEditing({ mode: "new" });
  };
  const openEdit = (e: Exercise) => {
    setDraft(fromExercise(e));
    setNote(null);
    setEditing({ mode: "edit", id: e.id });
  };
  const save = () => {
    if (editing?.mode === "new") return run(() => actions.add(toInput(draft)), "Added.", close);
    if (editing?.mode === "edit") return run(() => actions.update(editing.id, toInput(draft)), "Saved.", close);
  };

  return (
    <>
      <div className="tr-organise-head tr-library-head">
        <button type="button" className="admin-btn" onClick={() => setImportOpen((o) => !o)}>
          {importOpen ? "Hide import" : "Paste to import"}
        </button>
        <button type="button" className="admin-btn admin-btn--primary" onClick={openNew}>
          + Add exercise
        </button>
      </div>
      <ActionNote note={note} only="ok" />

      {importOpen && <ExerciseImport plans={plans} split={actions.split} confirm={actions.confirm} onDone={() => setImportOpen(false)} />}

      <section className="admin-card admin-section-card tr-card" aria-label="Exercises">
        <div className="tr-filters">
          <select className="admin-select" value={filters.side ?? ""} onChange={(e) => setFilters({ ...filters, side: e.target.value as Side | "" })} aria-label="Side">
            <option value="">Side: all</option>
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {SIDE_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="admin-select" value={filters.skill ?? ""} onChange={(e) => setFilters({ ...filters, skill: e.target.value })} aria-label="Skill">
            <option value="">Skill: all</option>
            {facets.skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className="admin-select" value={filters.format ?? ""} onChange={(e) => setFilters({ ...filters, format: e.target.value })} aria-label="Format">
            <option value="">Format: all</option>
            {facets.formats.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input className="admin-input" type="search" value={filters.q ?? ""} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search…" aria-label="Search" />
          <label className="tr-sign">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="tr-hint">{exercises.length === 0 ? "Nothing in the library yet. Add an exercise or paste a document." : "Nothing matches."}</p>
        ) : (
          <ul className="tr-log">
            {shown.map((e) => (
              <li key={e.id} className={`tr-log-row ${e.side === "reactive" ? "tr-type-2" : "tr-type-1"}${e.archived ? " is-skipped" : ""}`}>
                <div>
                  <div className="tr-row-title">{e.title}</div>
                  <div className="tr-row-meta">
                    {SIDE_LABEL[e.side].toLowerCase()}
                    {e.skills.length ? ` · ${e.skills.join(", ")}` : ""}
                    {e.format ? ` · ${e.format}` : ""} · {minutesLabel(e)}
                    {e.homeworkAble ? " · homework-able" : ""} · {planTitle(e.planId)}
                    {e.archived ? " · retired" : ""}
                  </div>
                </div>
                {!e.archived && (
                  <div className="tr-row-actions">
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => openEdit(e)}>
                      Edit
                    </button>
                    <ConfirmButton className="admin-btn admin-btn--sm" label="Retire" title="Retire this exercise?" body="Session plans that used it keep it; new ones cannot pick it." confirmLabel="Retire" onConfirm={() => actions.retire(e.id)} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <DetailDrawer open={editing !== null} onClose={close} title={editing?.mode === "edit" ? "Change the exercise" : "Add exercise"} footer={<DrawerFooter note={note} pending={pending} onCancel={close} onSubmit={save} submitLabel="Save" />}>
        <ExerciseForm draft={draft} onChange={setDraft} plans={plans} />
      </DetailDrawer>
    </>
  );
}
