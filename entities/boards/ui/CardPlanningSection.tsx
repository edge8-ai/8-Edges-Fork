"use client";

import { useState } from "react";
import type { BoardDetail, BoardPerson } from "@/entities/boards/lib/data";
import type { WorkboardCard, WorkboardData } from "@/entities/boards/lib/workboard";
import { SUBJECT_COMMITMENT } from "@/entities/boards/lib/types";
import { CardTargetFields } from "./CardTargetFields";
import { CardPlanningFields } from "./CardPlanningFields";
import { CardPrFields } from "./CardPrFields";
import { CardBlockers } from "./CardBlockers";
import type { Form, RunAction } from "./board-view-types";
import { addableFields, availableFields, filledFields, shownFields, type PlanningField } from "./card-field-visibility";

/**
 * PLANNING — the decisions ABOUT the card, in one plain section (W.92.6).
 *
 * Where the card lives, which roadmap item it belongs to, what its PR
 * shipped and what is blocking it. Its epic, sprint, PR and priority sit in
 * the header (W.152), and Snooze, Repeat and Needs a hand are no longer
 * offered: almost no card used them. None of it is the card; all of it
 * is somebody's decision about the card, which is why it sits below the
 * card's own story rather than between the title and it.
 *
 * It is a plain section, NOT a disclosure. This used to be a
 * `<details>` fold, and the rule now is that the Workboard has no folds: a
 * section you cannot see is a section nobody reads, and a triangle is one
 * more thing to operate before you can answer a question. Its place in the
 * drawer does the same job honestly — everything is on the page, in the order
 * it is wanted, and the browser's find, print and screen reader all get the
 * whole card without being told to open anything.
 */
export function CardPlanningSection({
  form,
  setForm,
  data,
  activeCard,
  isClientBoard,
  backlogItems,
  backlogGroups,
  people,
  slug,
  readOnly,
  saving,
  run,
  onOpenCard,
  onAddSubtask = null,
}: {
  form: Form;
  setForm: (form: Form | null) => void;
  data: WorkboardData;
  activeCard: WorkboardCard | null;
  isClientBoard: boolean;
  backlogItems: BoardDetail["backlogItems"];
  backlogGroups: BoardDetail["backlogGroups"];
  people: BoardPerson[];
  slug: string;
  readOnly: boolean;
  saving: boolean;
  run: RunAction;
  /** Opens another card in this drawer, for a blocker's card link (W.56). */
  onOpenCard?: (taskId: string) => void;
  /** Opens the card's Subtasks section, while it has none to show (W.159). */
  onAddSubtask?: (() => void) | null;
}) {
  // Only what the card holds, and what the person added (W.142); epic, sprint
  // and PR are never among them, because the header's pills draw those. The section
  // remounts per card (useSectionKey), so an added field belongs to the card
  // it was added on.
  const available = availableFields({
    isNew: !activeCard,
    isClientBoard,
    isCommitment: form.subjectType === SUBJECT_COMMITMENT,
    hasBacklog: backlogItems.length > 0,
    roadmapItemId: form.roadmapItemId,
  });
  const filled = filledFields({
    sprintId: form.sprintId, epicId: form.epicId, prUrl: form.prUrl, buildSummary: form.buildSummary, internal: form.internal,
    roadmapItemId: form.roadmapItemId, blockers: activeCard?.blockers.length ?? 0,
  });
  // Seeded with what the card held when it opened: a field the person clears
  // stays where it was until the drawer closes, rather than vanishing from
  // under the cursor mid-edit.
  const [added, setAdded] = useState<ReadonlySet<PlanningField>>(() => new Set(filled));
  const show = shownFields(available, filled, added, readOnly);
  const addable = readOnly ? [] : addableFields(available, show);
  return (
    <section className="wb-drawer-block wb-drawer-block--planning" aria-label="Planning">

      <CardTargetFields completedAt={activeCard?.status === "done" ? activeCard.completed_at : null} />

      <CardPlanningFields
        form={form}
        setForm={setForm}
        isClientBoard={isClientBoard}
        backlogItems={backlogItems}
        backlogGroups={backlogGroups}
        show={show}
      />

      <CardPrFields form={form} setForm={setForm} readOnly={readOnly} show={show} />

      {activeCard && show.has("blocker") && (
        <CardBlockers
          card={activeCard}
          slug={slug}
          people={people}
          clientContacts={data.clientContacts}
          // The cards a blocker may point at (W.56): this card's own board
          // only, so the picker cannot offer a card the action would refuse.
          cardOptions={data.cards.filter((c) => c.board_id === activeCard.board_id).map((c) => ({ id: c.id, title: c.title }))}
          saving={saving}
          run={run}
          readOnly={readOnly}
          onOpenCard={onOpenCard}
        />
      )}

      {/* Everything else, most used first, as one visible "+" chip per field
          the card does not hold yet (W.152). A menu hid what there was to
          add; a chip is a button the keyboard and a screen reader already
          know, and it names the field it adds. */}
      {(addable.length > 0 || onAddSubtask) && (
        <div className="wb-add-chips" role="group" aria-label="Add to this card">
          <span className="wb-core-label">Add</span>
          {onAddSubtask && (
            <button type="button" className="wb-add-chip" onClick={onAddSubtask}>
              + Subtask
            </button>
          )}
          {addable.map((f) => (
            <button
              key={f.key}
              type="button"
              className="wb-add-chip"
              onClick={() => setAdded(new Set([...added, f.key]))}
            >
              + {f.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
