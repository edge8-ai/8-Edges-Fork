"use client";

import { useMemo } from "react";
import { createCard } from "@/entities/boards/lib/actions";
import { setCardEpic } from "@/entities/boards/lib/epic-actions";
import { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import type { RunAction } from "./board-view-types";

// Making a card at the foot of a column without opening anything (W.92.8).
//
// The drawer is the right place to say who has it, how big it is and when it
// is due. It is the wrong place to write down "chase the invoice" while you
// are looking at the column it belongs in — eight fields and a save button
// for one line of text is why those cards get written on paper instead.
//
// So the foot takes a title and nothing else, and everything else is the
// board's own defaults: the column you typed in, priority P3, and the sprint
// and epic the board is already filtered to — the same presets `openCreate`
// gives the drawer, so a card made either way lands in the same place.
//
// Offered only with ONE board in scope. A lane is a column NAME merged across
// boards, so across boards "+ a card in Doing" has no board to put it on, and
// guessing one would file work where nobody is looking for it. There, the foot
// keeps the button that opens the drawer, which asks.

/**
 * Adds a card from a column foot, or undefined when this scope cannot.
 * `onFail` runs when no card was made — refused, unanswered, or never sent —
 * so the foot can take back the row it drew in the card's place (W.141).
 */
export type QuickAdd = (laneId: string, title: string, onDone: () => void, onFail: () => void) => void;

export function useWorkboardQuickAdd({
  single,
  canAdd,
  sprintFilter,
  epicFilter,
  run,
}: {
  single: WorkboardBoard | null;
  canAdd: boolean;
  /** The sprint the board is filtered to, or "all"/"backlog". */
  sprintFilter: string;
  /** The epics the board is filtered to; one of them is an answer, several is not. */
  epicFilter: string[];
  run: RunAction;
}): QuickAdd | undefined {
  return useMemo(() => {
    if (!canAdd || !single) return undefined;
    const sprintPreset = sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : "";
    const onlyEpic = epicFilter.length === 1 ? epicFilter[0] : "";
    const epicPreset = onlyEpic !== "" && onlyEpic !== "none" ? onlyEpic : "";
    return (laneId, title, onDone, onFail) => {
      // A lane is a column name; this board may have renamed or dropped it.
      const columnId = single.laneColumn[laneId];
      if (!columnId) return onFail();
      run(async () => {
        const created = await createCard({ boardId: single.id, columnId, title });
        if (!created.ok) return created;
        // The card exists from here on. A sprint or an epic that fails to
        // attach is reported, and the card is not rolled back: an unfiled
        // card on the board is recoverable and a lost sentence is not.
        if (created.id && sprintPreset) {
          const r = await setCardSprint(created.id, sprintPreset, single.slug);
          if (!r.ok) return r;
        }
        if (created.id && epicPreset) {
          const r = await setCardEpic(created.id, epicPreset, single.slug);
          if (!r.ok) return r;
        }
        return { ok: true };
      }, onDone, onFail);
    };
  }, [canAdd, single, sprintFilter, epicFilter, run]);
}
