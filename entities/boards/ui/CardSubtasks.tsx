"use client";

import { useOptimistic } from "react";
import { saigonToday } from "@/kernel/config/dates";
import { cardFacts } from "@/entities/boards/lib/card-facts";
import type { BoardCard, Subtask } from "@/entities/boards/lib/data";
import { addSubtask, toggleSubtask } from "@/entities/boards/lib/actions";
import { setTaskTokens } from "@/entities/boards/lib/token-actions";
import { promoteSubtask } from "@/entities/boards/lib/promote-subtask";
import { initials } from "@/kernel/ui/format";
import type { RunAction } from "./board-view-types";
import { useDraftFlag } from "./card-drawer-sections";

/**
 * A card's subtasks, as rows (W.92.6).
 *
 * A subtask IS a card — same `tasks` table, a `parent_task_id` and nothing
 * else — so it is drawn as one row of a list rather than as a checkbox with a
 * label: the done box, the title, who has it, and what it is worth. That is
 * also why one of them can be promoted out to the board in a click (W.57)
 * without retyping anything: there is nothing to convert.
 *
 * The parent's own estimate is the sum of the sized ones; the heading says
 * what they add up to, and the header's HT field refuses typing while they do
 * (entities/boards/lib/tokens.ts owns both figures).
 *
 * The assignee is shown, not edited: `Subtask` carries the name the board read
 * resolved, and there is no action that reassigns one. A control that cannot
 * write is worse than a fact that reads.
 */

/** The subtasks as they read once one tick has landed: the box, and nothing else. */
export function withTick(subtasks: Subtask[], tick: { id: string; done: boolean }): Subtask[] {
  return subtasks.map((s) => (s.id === tick.id ? { ...s, done: tick.done } : s));
}

export function CardSubtasks({
  card,
  slug,
  saving,
  run,
  readOnly = false,
  autoFocus = false,
  draft: newSubtask,
  onDraftChange: setNewSubtask,
}: {
  card: BoardCard;
  slug: string;
  saving: boolean;
  run: RunAction;
  readOnly?: boolean;
  /** Opened by "+ Subtask" (W.159): the caret goes where the person meant to type. */
  autoFocus?: boolean;
  /**
   * The subtask typed but not yet added. The drawer holds it, not this
   * section, so it outlives a visit to the History tab, which unmounts the
   * Details panel (W.163 F12).
   */
  draft: string;
  onDraftChange: (draft: string) => void;
}) {
  useDraftFlag("subtask", newSubtask.trim() !== "");
  // A ticked box shows ticked at once (W.194). It used to wait for the save,
  // its listeners and a re-render of the whole board, which on a board of
  // five hundred cards read as a box that ignored the click. useOptimistic
  // falls back to the server's subtasks when the transition ends, so a refused
  // tick puts the box back without a second code path, as MyCommitments does.
  const [subtasks, showTick] = useOptimistic(card.subtasks, withTick);
  const { done, total } = cardFacts({ ...card, subtasks }, { today: saigonToday() }).subtasks;

  // The tick must be shown inside the transition `run` opens, and it is:
  // settleWrite calls the write before its first await, and React only
  // keeps an async transition's scope up to that await.
  function tick(id: string, next: boolean) {
    run(() => {
      showTick({ id, done: next });
      return toggleSubtask(id, next, slug);
    });
  }

  function addSub() {
    if (!newSubtask.trim()) return;
    run(() => addSubtask(card.id, newSubtask, slug), () => setNewSubtask(""));
  }
  // Saves a subtask's Human Tokens on blur; "" clears the estimate. The field
  // is uncontrolled and keyed on the stored figure, which a refusal does not
  // change, so a refused or unusable figure is put back by hand: otherwise the
  // box goes on showing a number the card does not have (W.141).
  function saveSubTokens(id: string, field: HTMLInputElement, current: number | null) {
    const putBack = () => {
      field.value = current === null ? "" : String(current);
    };
    const raw = field.value;
    const next = raw.trim() === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0)) return putBack();
    if (next === current) return;
    run(() => setTaskTokens(id, next, slug), undefined, putBack);
  }

  return (
    <section className="wb-drawer-block">
      <h3 className="wb-drawer-heading">
        Subtasks
        {total > 0 ? ` · ${done} of ${total}` : ""}
      </h3>

      <ul className="wb-subtasks">
        {subtasks.map((s) => (
          <li key={s.id} className="wb-subtask">
            <input
              type="checkbox"
              className="wb-subtask-done"
              checked={s.done}
              aria-label={`${s.title} done`}
              onChange={(e) => tick(s.id, e.target.checked)}
              disabled={saving}
            />
            <span className={s.done || s.setAside ? "wb-subtask-title wb-subtask-title--done" : "wb-subtask-title"}>
              {s.title}
              {s.setAside && <span className="admin-cell-muted u-sm"> · not doing</span>}
            </span>
            {s.assignee_name ? (
              <span className="wb-subtask-who" title={s.assignee_name} aria-label={`Assigned to ${s.assignee_name}`}>
                {initials(s.assignee_name)}
              </span>
            ) : (
              <span className="wb-subtask-who wb-subtask-who--none" aria-hidden="true" />
            )}
            <input
              className="admin-input wb-subtask-ht"
              type="number"
              min={0}
              step={0.05}
              placeholder="—"
              aria-label={`Human Tokens for ${s.title}`}
              title="Human Tokens"
              key={`${s.id}-${s.human_tokens ?? ""}`}
              defaultValue={s.human_tokens ?? ""}
              onBlur={(e) => saveSubTokens(s.id, e.currentTarget, s.human_tokens)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              disabled={saving}
            />
            {/* A subtask that turned out to be a day's work becomes a card in
                one click (W.57), keeping its id, its comments and its history
                — which is everything retyping it by hand used to throw away.
                Not offered on a finished subtask: promoting one would put a
                done card in the parent's column for nobody to do. */}
            {!readOnly && !s.done && (
              <button
                type="button"
                className="admin-btn admin-btn--sm wb-subtask-promote"
                disabled={saving}
                title="Make this its own card, in this card's column"
                aria-label={`Promote ${s.title} to its own card`}
                onClick={() => run(() => promoteSubtask(s.id, slug))}
              >
                ↗ Card
              </button>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (
        <div className="u-row u-mt-2">
          <input
            className="admin-input"
            aria-label="Add a subtask"
            autoFocus={autoFocus}
            placeholder="Add a subtask…"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSub();
              }
            }}
          />
          <button className="admin-btn" onClick={addSub} disabled={saving || !newSubtask.trim()}>
            Add
          </button>
        </div>
      )}
    </section>
  );
}
