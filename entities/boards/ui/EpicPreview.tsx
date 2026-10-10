"use client";

import Link from "next/link";
import { useState } from "react";
import { EPIC_COLORS, epicColor } from "@/entities/boards/lib/types";
import { setEpicArchived, updateEpic } from "@/entities/boards/lib/epic-actions";
import { formatTokens } from "@/entities/boards/lib/tokens";
import { useBoardActionRunner } from "./useBoardActionRunner";

// The side car for one epic on the epics page: its facts as an admin-kv list,
// then the edits (name, description, colour, archive) for someone who may
// manage the board.
export function EpicPreview({
  epic,
  figures,
  cardsHref,
  slug,
  canManage,
}: {
  epic: { id: string; name: string; description: string | null; color: string | null; archived: boolean };
  figures: { open: number; done: number; doneTokens: number; tokens: number };
  cardsHref: string;
  slug: string;
  canManage: boolean;
}) {
  const [banner, setBanner] = useState<string | null>(null);
  const { saving, run } = useBoardActionRunner(setBanner);
  const [form, setForm] = useState({ name: epic.name, description: epic.description ?? "" });
  const changed = form.name.trim() !== epic.name || form.description.trim() !== (epic.description ?? "");

  function save() {
    const name = form.name.trim();
    if (!name) return setBanner("The epic needs a name.");
    run(() => updateEpic(epic.id, { name, description: form.description.trim() || null }, slug));
  }

  return (
    <>
      {banner && <div className="admin-alert admin-alert--err u-mb-3">{banner}</div>}
      <dl className="admin-kv u-mb-4">
        <dt>Description</dt>
        <dd>{epic.description || "—"}</dd>
        <dt>Open</dt>
        <dd className="admin-cell-mono">{figures.open}</dd>
        <dt>Done</dt>
        <dd className="admin-cell-mono">{figures.done}</dd>
        <dt>Human Tokens</dt>
        <dd className="admin-cell-mono">
          {figures.tokens > 0 ? `${formatTokens(figures.doneTokens)} of ${formatTokens(figures.tokens)} delivered` : "—"}
        </dd>
        <dt>Status</dt>
        <dd>{epic.archived ? "Archived" : "Active"}</dd>
      </dl>
      <Link className="admin-btn admin-btn--sm" href={cardsHref}>
        Open its cards
      </Link>

      {canManage && (
        <div className="u-stack u-gap-3 u-mt-5">
          <div className="admin-label">Edit</div>
          <input
            className="admin-input"
            aria-label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            disabled={saving}
          />
          <input
            className="admin-input"
            aria-label="Description"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={saving}
          />
          <div className="admin-board-epic-swatches">
            {EPIC_COLORS.map((col) => (
              <button
                key={col}
                type="button"
                aria-label={`Set colour ${EPIC_COLORS.indexOf(col) + 1}`}
                onClick={() => run(() => updateEpic(epic.id, { color: col }, slug))}
                disabled={saving}
                className={`admin-board-epic-swatch${epicColor(epic.color) === col ? " is-selected" : ""}`}
                data-epic-color={EPIC_COLORS.indexOf(col)}
              />
            ))}
          </div>
          <div className="u-row u-gap-2">
            <button className="admin-btn admin-btn--primary admin-btn--sm" onClick={save} disabled={saving || !changed}>
              Save
            </button>
            <button
              className="admin-btn admin-btn--sm"
              onClick={() => run(() => setEpicArchived(epic.id, !epic.archived, slug))}
              disabled={saving}
            >
              {epic.archived ? "Restore" : "Archive"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
