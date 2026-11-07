"use client";

// Settings → Training types (TR.2): the kinds of training this organisation
// runs. Add one, rename one, retire one. A retired type keeps its trainings and
// leaves the pickers; it is shown greyed so its history stays readable.
import { useState } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { ActionNote } from "./ActionNote";

type Type = { id: string; name: string; archived: boolean };

export function TrainingTypesEditor({
  types,
  actions,
}: {
  types: Type[];
  actions: { add: (name: unknown) => Promise<Result>; rename: (id: string, name: unknown) => Promise<Result>; retire: (id: string) => Promise<Result> };
}) {
  const { note, pending, run } = useActionRunner();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  return (
    <section className="admin-card admin-section-card" aria-label="Training types">
      <form
        className="tr-type-add"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => actions.add(name), "Added.", () => setName(""));
        }}
      >
        <label className="admin-field tr-type-add-field">
          <span className="admin-label">New type</span>
          <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Scrim" />
        </label>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !name.trim()}>
          Add
        </button>
      </form>
      <ActionNote note={note} />
      <ul className="admin-list">
        {types.map((t) => (
          <li key={t.id} className={`admin-list-row${t.archived ? " admin-row-archived" : ""}`}>
            <div className="admin-list-main">
              {renaming?.id === t.id ? (
                <input
                  className="admin-input"
                  aria-label={`New name for ${t.name}`}
                  value={renaming.name}
                  onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                  maxLength={60}
                />
              ) : (
                <span className="admin-list-title">{t.name}</span>
              )}
              {t.archived && <span className="admin-list-sub">Retired: kept on its trainings, gone from the pickers.</span>}
            </div>
            {!t.archived && (
              <div className="admin-list-aside admin-list-aside--row">
                {renaming?.id === t.id ? (
                  <>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setRenaming(null)} disabled={pending}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      disabled={pending || !renaming.name.trim()}
                      onClick={() => run(() => actions.rename(t.id, renaming.name), "Renamed.", () => setRenaming(null))}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => setRenaming({ id: t.id, name: t.name })}>
                      Rename
                    </button>
                    <ConfirmButton
                      className="admin-btn admin-btn--sm"
                      label="Retire"
                      title={`Retire ${t.name}?`}
                      body="Its trainings keep it. New trainings can no longer choose it."
                      confirmLabel="Retire"
                      onConfirm={() => actions.retire(t.id)}
                    />
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
