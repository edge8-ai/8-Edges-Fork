"use client";

import { useState } from "react";
import { EPIC_COLORS } from "@/entities/boards/lib/types";
import { createEpic } from "@/entities/boards/lib/epic-actions";
import type { RunAction } from "./board-view-types";

// The New epic form on the epics page: a name, an optional description and a colour.
export function NewEpicForm({ boardId, slug, saving, run, onError }: { boardId: string; slug: string; saving: boolean; run: RunAction; onError: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", color: EPIC_COLORS[0] as string, description: "" });

  function addEpic() {
    if (!form.name.trim()) return onError("Name the epic.");
    run(
      () => createEpic(boardId, { name: form.name, color: form.color, description: form.description || undefined }, slug),
      () => setForm({ name: "", color: EPIC_COLORS[0], description: "" }),
    );
  }

  return (
    <div className="admin-card u-p-4">
      <p className="u-m-0 u-mb-3 u-lg">New epic</p>
      <div className="u-row u-gap-3 u-wrap">
        <input
          className="admin-input admin-input--w-sm"
          placeholder="Name (e.g. Time Off)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEpic();
            }
          }}
        />
        <input
          className="admin-input admin-input--w-sm"
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="admin-board-epic-swatches">
          {EPIC_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              aria-label={`Color ${col}`}
              onClick={() => setForm({ ...form, color: col })}
              className={`admin-board-epic-swatch${form.color === col ? " is-selected" : ""}`}
              data-epic-color={EPIC_COLORS.indexOf(col)}
            />
          ))}
        </div>
        <button className="admin-btn admin-btn--primary" onClick={addEpic} disabled={saving}>
          Add epic
        </button>
      </div>
    </div>
  );
}
