"use client";

import type { ReactNode } from "react";
import { epicTotals, type EpicTotals } from "@/entities/boards/lib/epic-totals";
import { epicColorIndex, type EpicRow } from "@/entities/boards/lib/types";
import { formatTokens } from "@/entities/boards/lib/tokens";

// Which theme slipped this week (W.24). The sprint page used to answer that
// question with a table of PEOPLE — done, total, HT done, HT planned per
// assignee, sorted by HT — which is a per-person metric on a product surface
// and the thing the house rule and the no-person row types in flow-metrics.ts
// exist to prevent. It predates the rule.
//
// The table shape is worth keeping; the axis is not. One row per epic plus a
// row for the cards with none answers the retro question the person table was
// reaching for, without describing anybody. The aggregate it reads is
// epic-totals.ts, whose row type carries no assignee_id, owner_id or moved_by
// — there is no person column for a caller to slice by.
//
// If a per-person read is ever wanted for coaching it belongs in
// entities/coaching, where the viewer is the person being read about.

type EpicLine = { key: string; name: string; color: number | null; totals: EpicTotals };

/** Rows sorted by the work they hold, largest first; "No epic" always last. */
export function epicLines(cards: { epic_id: string | null; status: string; human_tokens: number | null }[], epics: EpicRow[]): EpicLine[] {
  const { byEpic, none } = epicTotals(cards);
  const byId = new Map(epics.map((e) => [e.id, e]));
  const lines: EpicLine[] = [...byEpic].map(([id, totals]) => ({
    key: id,
    name: byId.get(id)?.name ?? "Unknown epic",
    color: byId.get(id) ? epicColorIndex(byId.get(id)!.color) : null,
    totals,
  }));
  const ht = (t: EpicTotals) => t.openTokens + t.doneTokens;
  lines.sort((a, b) => ht(b.totals) - ht(a.totals) || b.totals.open + b.totals.done - (a.totals.open + a.totals.done) || a.name.localeCompare(b.name));
  if (none.open + none.done > 0) lines.push({ key: "none", name: "No epic", color: null, totals: none });
  return lines;
}

export function SprintEpicTable({
  cards,
  epics,
  bar,
}: {
  cards: { epic_id: string | null; status: string; human_tokens: number | null }[];
  epics: EpicRow[];
  // The same thin meter the plan-vs-actual tiles above use, handed in rather
  // than redrawn: one data-driven width, owned by one file.
  bar: (pct: number) => ReactNode;
}) {
  const lines = epicLines(cards, epics);
  if (lines.length === 0) return null;
  return (
    <div className="u-mt-4">
      <div className="admin-label">By epic</div>
      {lines.map((line) => {
        const total = line.totals.open + line.totals.done;
        const totalHT = line.totals.openTokens + line.totals.doneTokens;
        const pct = total ? Math.round((line.totals.done / total) * 100) : 0;
        return (
          <div key={line.key} className="admin-row-divided">
            <span className="admin-cell-strong u-flex-1">
              {line.color !== null && <span className="admin-board-epic-dot" data-epic-color={line.color} />}
              {line.name}
            </span>
            <span className="admin-cell-muted u-sm">
              {line.totals.done}/{total} cards
            </span>
            <span className="admin-cell-muted u-sm u-right u-w-120">
              {formatTokens(line.totals.doneTokens)}/{formatTokens(totalHT)} HT
            </span>
            <span className="u-w-120">{bar(pct)}</span>
          </div>
        );
      })}
    </div>
  );
}
