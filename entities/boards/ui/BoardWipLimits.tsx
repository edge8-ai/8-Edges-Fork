"use client";

import { useState } from "react";
import { setColumnWipLimit } from "@/entities/boards/lib/column-actions";
import type { BoardColumnRow } from "@/entities/boards/lib/types";
import type { RunAction } from "./board-view-types";

/**
 * Work-in-progress limits, one per column (W.31).
 *
 * The section is worded the way the limit behaves. It is INFORMATION: over
 * the cap the column header reads "7 / 5" and the count turns amber, and the
 * drop still succeeds. Nothing here can be made to block, and the hint says
 * so out loud so nobody sets one expecting it to.
 *
 * It asks about the WORK — how much this column is holding at once — and the
 * board has no per-person counterpart, by rule.
 */
export function BoardWipLimits({
  columns,
  slug,
  saving,
  run,
}: {
  columns: BoardColumnRow[];
  slug: string;
  saving: boolean;
  run: RunAction;
}) {
  // Each row keeps only what has been typed and not yet sent; everything else
  // reads from the server's value, so a save that failed leaves the field
  // showing what the board actually holds.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const ordered = [...columns].sort((a, b) => a.position - b.position);

  function commit(column: BoardColumnRow, raw: string) {
    const trimmed = raw.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && (!Number.isInteger(next) || next < 1)) return;
    setDraft(({ [column.id]: _sent, ...rest }) => rest);
    if (next === column.wip_limit) return;
    run(() => setColumnWipLimit(column.id, next, slug));
  }

  if (ordered.length === 0) return null;
  return (
    <div className="u-mt-4">
      <label className="admin-label">Work-in-progress limits</label>
      <p className="admin-hint">
        How many cards a column should hold at once. Over the limit the count turns amber and reads &ldquo;7 / 5&rdquo;
        — the card still drops. It is a question about the work, not a rule about anyone.
      </p>
      {ordered.map((c) => (
        <div key={c.id} className="admin-row-divided">
          <span className="admin-cell-strong u-grow">{c.name}</span>
          <input
            className="admin-input admin-input--w-xs"
            type="number"
            min={1}
            step={1}
            placeholder="None"
            aria-label={`Work-in-progress limit for ${c.name}`}
            value={draft[c.id] ?? (c.wip_limit == null ? "" : String(c.wip_limit))}
            disabled={saving}
            onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
            onBlur={(e) => commit(c, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
