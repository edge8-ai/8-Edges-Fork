"use client";

import type { ReactNode } from "react";
import type { WorkboardCard } from "@/entities/boards/lib/workboard";
import type { BoardPerson } from "@/entities/boards/lib/data";
import { CardSubtasks } from "./CardSubtasks";
import { CardActivity } from "./CardActivity";
import { CardDeliverables } from "./CardDeliverables";
import { NewCardDeliverables } from "./NewCardDeliverables";
import type { Form, RunAction } from "./board-view-types";
import type { SubtaskOpener } from "./useSubtaskOpener";

/**
 * THE STORY — what the card is, what it is made of, and what has happened to
 * it (W.66, regrouped by W.92.6).
 *
 * The description, what the work produced (its deliverables), the subtasks,
 * and one Activity stream. Everything that is a DECISION about the card — sprint, epic, PR,
 * blockers, snooze, repeat — moved down into Planning, and the four fields
 * people change without reading anything moved up into the header bar. What
 * is left here is the card itself, which is what the drawer was opened for.
 *
 * Every block keeps its existing rule for a read-only surface: shown when
 * there is something to read, absent when there is not. The order is the same
 * on every surface; only the controls go away.
 */
export function CardStory({
  form,
  setForm,
  activeCard,
  slug,
  readOnly,
  saving,
  run,
  people,
  subtasks,
  between,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  activeCard: WorkboardCard | null;
  slug: string;
  readOnly: boolean;
  saving: boolean;
  run: RunAction;
  /** Who a comment can @mention (W.143): the people already on this board. */
  people: BoardPerson[];
  /**
   * Whether "+ Subtask" opened the section, and what is typed in it. The
   * drawer holds them, not this component, because the History tab unmounts
   * the Details panel and both used to be lost on the way back (W.163 F12).
   */
  subtasks: SubtaskOpener;
  /**
   * What sits between the subtasks and the activity: the card's planning
   * fields and its "+" chips, where the approved canvas puts them (W.159).
   * It is handed the "+ Subtask" chip's action while the card has no subtasks
   * to show, and null once it has.
   */
  between?: (onAddSubtask: (() => void) | null) => ReactNode;
}) {
  // A card with no subtasks draws no empty Subtasks section, as the canvas
  // does not (W.159): "+ Subtask" sits with the other "+" chips and opens it.
  // The drawer keeps the opened section per card (useSubtaskOpener).
  const subtasksOpened = subtasks.opened;
  const hasSubtasks = (activeCard?.subtasks.length ?? 0) > 0;
  const showSubtasks = activeCard !== null && (hasSubtasks || (!readOnly && subtasksOpened));
  // A new card has no id to hang a subtask on until it is created, so it is
  // offered no chip that would promise one.
  const onAddSubtask = activeCard && !readOnly && !showSubtasks ? subtasks.open : null;
  return (
    <>
      {(!readOnly || form.description) && (
        <section className="wb-drawer-block">
          <h3 className="wb-drawer-heading">Description</h3>
          <textarea
            className="admin-textarea"
            rows={4}
            aria-label="Description"
            placeholder="What is this about?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </section>
      )}

      {/* What the work produced (W.155), where the canvas puts it: under the
          description it answers to. Team only — the one read-only surface is
          the client's portal, which never sees deliverables. A saved card
          lists its own; a new card, which has no id to hang them on yet, holds
          what it is given until Create makes it (W.163 U7). */}
      {activeCard && form.id && !readOnly && (
        <CardDeliverables taskId={activeCard.id} currentPrUrl={form.prUrl} onUseAsPr={(prUrl) => setForm({ ...form, prUrl })} />
      )}
      {!form.id && !readOnly && <NewCardDeliverables currentPrUrl={form.prUrl} onUseAsPr={(prUrl) => setForm({ ...form, prUrl })} />}

      {activeCard && showSubtasks && (
        <CardSubtasks
          card={activeCard}
          slug={slug}
          saving={saving}
          run={run}
          readOnly={readOnly}
          autoFocus={subtasksOpened && !hasSubtasks}
          draft={subtasks.draft}
          onDraftChange={subtasks.setDraft}
        />
      )}

      {between?.(onAddSubtask)}

      {activeCard && (!readOnly || activeCard.comments.length > 0) && (
        <CardActivity card={activeCard} slug={slug} saving={saving} run={run} readOnly={readOnly} people={people} />
      )}
    </>
  );
}
