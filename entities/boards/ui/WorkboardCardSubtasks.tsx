"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/kernel/ui/Icon";
import { initials } from "@/entities/boards/lib/types";
import { subtaskProgress } from "@/entities/boards/lib/card-facts";
import type { Subtask } from "@/entities/boards/lib/data";

// A parent card's subtasks, inline on the board (W.92.7).
//
// Before this, the only way to see what the subtask count stood for was to open the
// card, read nine rows in a drawer and close it again — three interactions to
// answer "is the last one the hard one". The chevron opens the same nine rows
// under the card, as compact lines, and a tick writes through the same
// toggleSubtask the drawer calls, so the two cannot mean different things.
//
// Collapsed by default, because a board where every parent is open is a list
// and not a board. What IS remembered is the choice, per card, in
// localStorage — the same place the board keeps its view and its filters — so
// the one card somebody is working through stays open across a refresh while
// the other forty stay shut.

const KEY_PREFIX = "workboard:subtasks:";

function recallOpen(cardId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + cardId) === "1";
  } catch {
    // Storage may be unavailable (a locked-down browser, private mode). The
    // expander still works for this page load; only the memory is lost.
    return false;
  }
}

function rememberOpen(cardId: string, open: boolean) {
  try {
    if (open) localStorage.setItem(KEY_PREFIX + cardId, "1");
    else localStorage.removeItem(KEY_PREFIX + cardId);
  } catch {
    // As above.
  }
}

// Split in two since W.114: the toggle sits in the card's facts row, where the
// plain count sits on every other surface, and the list opens under the card.
// On a row of its own the toggle made every parent card one line taller than
// its neighbours, so the lanes never lined up row by row. The state both
// halves read lives in this hook, so the count and the ticks cannot disagree.
export function useWorkboardCardSubtasks(
  cardId: string,
  subtasks: Subtask[],
  /** Absent when the viewer may not edit: the rows read, and the boxes are disabled. */
  /** `onFail` puts the box back when the server refuses the tick (W.141). */
  onToggle?: (subtaskId: string, done: boolean, onFail: () => void) => void,
) {
  const [open, setOpen] = useState(false);
  // Read after mount rather than in the initial state: the board is rendered
  // on the server first, and seeding from localStorage during render would
  // hydrate a different tree than the server sent.
  // Every card on the board runs this hook, so a card with no subtasks must
  // cost nothing: no storage read, and no state set to trigger a render.
  const has = subtasks.length > 0;
  useEffect(() => {
    if (has) setOpen(recallOpen(cardId));
  }, [cardId, has]);

  // What has been ticked here but not yet come back from the server. The
  // parent's count is derived from it too, so `3/9` becomes `4/9` the moment
  // the box is ticked rather than after the refresh lands.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // Whatever the server has now is the truth; a fresh `subtasks` identity
  // means the refresh arrived, so the optimistic layer is dropped.
  // Returning the same object when nothing is pending lets React skip the render.
  useEffect(() => setPending((p) => (Object.keys(p).length === 0 ? p : {})), [subtasks]);

  const doneOf = (s: Subtask) => pending[s.id] ?? s.done;
  // The tally and the count are the card's progress (card-facts), with the
  // ticks not yet back from the server applied: set-aside subtasks are owed
  // by nobody, so neither number counts them (bug hunt F15). The count used
  // to leave them out while the tally did not, so "1/2" could open on three
  // rows with two ticked.
  const progress = subtaskProgress(subtasks.map((s) => ({ done: doneOf(s), setAside: s.setAside })));
  return {
    open,
    done: progress.done,
    total: progress.total,
    setAside: subtasks.filter((s) => s.setAside).length,
    doneOf,
    canToggle: !!onToggle,
    flip() {
      const next = !open;
      setOpen(next);
      rememberOpen(cardId, next);
    },
    toggle(s: Subtask) {
      // A set-aside subtask is closed with its card, not open work to tick.
      if (!onToggle || s.setAside) return;
      const next = !doneOf(s);
      setPending((p) => ({ ...p, [s.id]: next }));
      // A refusal brings no refresh, so nothing else would ever drop this
      // tick: the box would go on showing the answer the server said no to.
      onToggle(s.id, next, () =>
        setPending((p) => {
          if (!(s.id in p)) return p;
          const { [s.id]: _refused, ...rest } = p;
          return rest;
        }),
      );
    },
  };
}

type SubtasksState = ReturnType<typeof useWorkboardCardSubtasks>;

/**
 * The rows in the order the expander lists them: the owed subtasks as they
 * came, then the set-aside ones, so the rows the count speaks for come first
 * and the ones it leaves out sit together at the end (bug hunt F15).
 */
function subtasksInOrder(subtasks: Subtask[]): Subtask[] {
  return [...subtasks.filter((s) => !s.setAside), ...subtasks.filter((s) => s.setAside)];
}

export function WorkboardSubtasksToggle({ state, cardTitle }: { state: SubtasksState; cardTitle: string }) {
  const count = state.total;
  // A card whose subtasks were all set aside owes nothing, so "0/0" and "the
  // 0 subtasks" would read as broken; it names what the list holds instead.
  const allAside = count === 0 && state.setAside > 0;
  const what = allAside
    ? `${state.setAside} set-aside subtask${state.setAside === 1 ? "" : "s"}`
    : `${count} subtask${count === 1 ? "" : "s"}`;
  return (
    <button
      type="button"
      className={`wb-subtasks-toggle${state.open ? " is-open" : ""}`}
      aria-expanded={state.open}
      aria-label={`${state.open ? "Hide" : "Show"} the ${what} of ${cardTitle}`}
      onClick={(e) => {
        // The card behind it opens the drawer on a click.
        e.stopPropagation();
        state.flip();
      }}
    >
      <span className="wb-subtasks-chevron" aria-hidden="true">
        ›
      </span>
      <Icon name="checklist" /> {allAside ? "Set aside" : `${state.done}/${count}`}
    </button>
  );
}

export function WorkboardSubtasksList({ state, subtasks, saving }: { state: SubtasksState; subtasks: Subtask[]; saving: boolean }) {
  // Nothing to list, whatever the remembered state says: a card saved as open
  // whose subtasks were since removed must not draw an empty block (W.114).
  if (!state.open || subtasks.length === 0) return null;
  return (
    <div className="wb-subtasks" onClick={(e) => e.stopPropagation()}>
      <ul className="wb-subtasks-list">
        {subtasksInOrder(subtasks).map((s) => {
          const isDone = state.doneOf(s);
          const setAside = s.setAside === true;
          return (
            <li key={s.id} className={`wb-subtask${isDone ? " is-done" : ""}${setAside ? " is-set-aside" : ""}`}>
              <input
                type="checkbox"
                checked={isDone}
                // Closed with its card: nothing to tick, and the count above
                // does not include it either.
                disabled={saving || !state.canToggle || setAside}
                aria-label={setAside ? `${s.title}, set aside` : s.title}
                onChange={() => state.toggle(s)}
              />
              <span className="wb-subtask-title">{s.title}</span>
              {setAside && <span className="wb-subtask-aside">Set aside</span>}
              {s.assignee_name && (
                // The avatar says who has it and nothing else: no figure
                // here is sliced by person, and the initials are a label on
                // one subtask, not a measurement of anybody.
                <span className="admin-avatar admin-avatar--sm admin-avatar--soft" title={s.assignee_name}>
                  {initials(s.assignee_name)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
