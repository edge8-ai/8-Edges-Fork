"use client";

import { useState } from "react";
import { MAX_TEMPLATES, type CardTemplate } from "@/entities/boards/lib/card-templates";
import { setCardTemplates } from "@/entities/boards/lib/template-actions";
import { TASK_PRIORITIES, PRIORITY_LABEL, type EpicRow, type TaskPriority } from "@/entities/boards/lib/types";
import type { RunAction } from "./board-view-types";

// The board's card templates, in Board settings (W.58).
//
// Edited as a list and saved as one value: the templates are one jsonb
// column, and a per-template save would give two people editing settings at
// once a way to lose each other's work without either noticing.
//
// A template is a SKELETON, not a card. It carries the description that says
// what done means for this kind of work, and the epic, priority and estimate
// that are true of it every time — and deliberately not a title, because the
// title is the one thing that differs between two client onboardings.
export function BoardTemplatesField({
  boardId,
  slug,
  epics,
  initial,
  saving,
  run,
}: {
  boardId: string;
  slug: string;
  /** This board's active epics, for the default-epic picker. */
  epics: EpicRow[];
  initial: CardTemplate[];
  saving: boolean;
  run: RunAction;
}) {
  const [list, setList] = useState<CardTemplate[]>(initial);

  const patch = (i: number, next: Partial<CardTemplate>) =>
    setList((l) => l.map((t, k) => (k === i ? { ...t, ...next } : t)));

  return (
    <div className="u-mt-4">
      <label className="admin-label">Card templates ({list.length})</label>
      <p className="admin-hint">
        The definition of done for a recurring kind of work. “New card” offers them; a board with none shows the plain
        button.
      </p>
      {list.map((t, i) => (
        <div key={i} className="admin-board-template">
          <div className="u-row">
            <input
              className="admin-input u-grow"
              value={t.name}
              placeholder="Client onboarding"
              aria-label="Template name"
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <select
              className="admin-select u-w-90 u-shrink-none"
              value={t.priority ?? ""}
              aria-label="Default priority"
              onChange={(e) => patch(i, { priority: (e.target.value || undefined) as TaskPriority | undefined })}
            >
              <option value="">Priority</option>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              className="admin-input u-w-90 u-shrink-none"
              type="number"
              min={0}
              step={0.05}
              placeholder="HT"
              aria-label="Default Human Tokens"
              value={t.humanTokens ?? ""}
              onChange={(e) => patch(i, { humanTokens: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
            <button type="button" className="admin-btn admin-btn--sm u-shrink-none" aria-label={`Remove ${t.name || "template"}`} onClick={() => setList((l) => l.filter((_, k) => k !== i))}>
              Remove
            </button>
          </div>
          {epics.length > 0 && (
            <select className="admin-select u-mt-1" value={t.epicId ?? ""} aria-label="Default epic" onChange={(e) => patch(i, { epicId: e.target.value || undefined })}>
              <option value="">No default epic</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <textarea
            className="admin-textarea u-mt-1"
            rows={3}
            placeholder="What done looks like for this kind of work."
            aria-label="Description skeleton"
            value={t.description ?? ""}
            onChange={(e) => patch(i, { description: e.target.value || undefined })}
          />
        </div>
      ))}
      <div className="u-row u-mt-2">
        <button type="button" className="admin-btn" disabled={saving || list.length >= MAX_TEMPLATES} onClick={() => setList((l) => [...l, { name: "" }])}>
          Add a template
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={saving}
          // Blank rows are dropped rather than refused: a person who added a
          // row and changed their mind should be able to save the others.
          onClick={() => run(() => setCardTemplates(boardId, list.filter((t) => t.name.trim() !== ""), slug))}
        >
          Save templates
        </button>
      </div>
    </div>
  );
}
