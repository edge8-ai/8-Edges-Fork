"use client";

import type { Dispatch, SetStateAction } from "react";
import type { WorkboardCard, WorkboardBoard } from "@/entities/boards/lib/workboard";
import { SUBJECT_COMMITMENT } from "@/entities/boards/lib/types";
import type { setCardInternal, setCardRoadmapItem, updateCard } from "@/entities/boards/lib/actions";
import type { setCardSprint } from "@/entities/boards/lib/sprint-actions";
import type { setCardEpic } from "@/entities/boards/lib/epic-actions";
import { withRejectionReported } from "@/kernel/ui/hooks/settle-write";
import type { Form } from "./board-view-types";
import type { SavedField } from "./card-autosave";
import { estimateToSave } from "./save-estimate";

/** The writes a saved card needs, handed in by the hook that owns them. */
export type CardEditActions = {
  updateCard: typeof updateCard;
  setCardSprint: typeof setCardSprint;
  setCardEpic: typeof setCardEpic;
  setCardRoadmapItem: typeof setCardRoadmapItem;
  setCardInternal: typeof setCardInternal;
};

/**
 * Writes the named fields of a saved card (TH.3.2), as autosave asks. Only
 * what changed is sent, so a save is one audit row about one edit, and a pick
 * of a sprint does not resend the description. Each step that lands moves its
 * `orig*` forward to the value it SENT: the person may have changed the field
 * again while the write was out, and that newer value is still unsaved. A
 * handover's line is passed on with the assignee and cleared only if nobody
 * rewrote it meanwhile.
 *
 * It runs outside the board's transition. Inside it, every save would set
 * the board's `saving`, which disables the drawer's other controls (subtask
 * estimates and ticks, Archive) for as long as the write takes, under the
 * hands of somebody still working in the drawer. A refusal re-syncs the board
 * from the server, so what the person sees is the truth.
 *
 * The actions are handed in by useCardForm, the hook the hidden-control
 * allowlist already names for them (ADR 0014), so this module calls no
 * action of its own.
 */
export function persistCardEdits(
  form: Form,
  fields: SavedField[],
  deps: {
    board: WorkboardBoard | undefined;
    liveCard: WorkboardCard | undefined;
    setForm: Dispatch<SetStateAction<Form | null>>;
    setBanner: (message: string | null) => void;
    refresh: () => void;
    actions: CardEditActions;
  },
): Promise<boolean> {
  const { board, setForm, setBanner, actions } = deps;
  const id = form.id;
  if (!board || !id) return Promise.resolve(false);
  const slug = board.slug;
  const isClientBoard = board.client_company_id != null;
  const has = (k: SavedField) => fields.includes(k);
  const land = (fold: (f: Form) => Form) => setForm((f) => (f && f.id === id ? fold(f) : f));
  let ok = false;
  const fail = (message: string) => {
    setBanner(message);
    deps.refresh();
  };
  setBanner(null);
  return withRejectionReported(async () => {
    const patch: Parameters<CardEditActions["updateCard"]>[1] = {};
    if (has("title")) patch.title = form.title;
    if (has("description")) patch.description = form.description;
    if (has("priority")) patch.priority = form.priority;
    if (has("assigneeId")) {
      patch.assigneeId = form.assigneeId || null;
      patch.handoverNote = form.handoverNote;
    }
    if (has("dueDate")) patch.dueDate = form.dueDate || null;
    // Sent only when edited, and never for a card its subtasks now decide
    // (W.130): the server may have moved on since the copy.
    const tokens = has("humanTokens") ? estimateToSave(form.humanTokens, form.origHumanTokens, deps.liveCard?.subtasks) : undefined;
    if (tokens !== undefined) patch.humanTokens = tokens;
    if (has("prUrl")) patch.prUrl = form.prUrl;
    if (has("buildSummary")) patch.buildSummary = form.buildSummary;
    if (Object.keys(patch).length > 0) {
      const r = await actions.updateCard(id, patch, slug);
      if (!r.ok) return fail(r.error);
      land((f) => ({
        ...f,
        ...(has("assigneeId") ? { origAssigneeId: form.assigneeId, handoverNote: f.handoverNote === form.handoverNote ? "" : f.handoverNote } : {}),
        ...(tokens !== undefined ? { origHumanTokens: form.humanTokens } : {}),
      }));
    }
    if (has("sprintId")) {
      const sr = await actions.setCardSprint(id, form.sprintId || null, slug);
      // "Committed, but the history could not be written" (A.54) is a commit:
      // the card is in the sprint, so the form lands it and the banner says
      // what did not follow. Failing it would mark a save that happened as
      // failed, and its retry would find the card already in the sprint.
      if (!sr.ok && !sr.persisted) return fail(sr.error);
      if (!sr.ok) setBanner(sr.error);
      land((f) => ({ ...f, origSprintId: form.sprintId }));
    }
    if (has("epicId")) {
      const er = await actions.setCardEpic(id, form.epicId || null, slug);
      if (!er.ok) return fail(er.error);
      land((f) => ({ ...f, origEpicId: form.epicId }));
    }
    // Roadmap link and the internal flag: client boards only, and a
    // commitment card is never linked to a roadmap item.
    if (has("roadmapItemId") && isClientBoard && form.subjectType !== SUBJECT_COMMITMENT) {
      const rr = await actions.setCardRoadmapItem(id, form.roadmapItemId || null, slug);
      if (!rr.ok) return fail(rr.error);
      land((f) => ({ ...f, origRoadmapItemId: form.roadmapItemId }));
    }
    if (has("internal") && isClientBoard) {
      const ir = await actions.setCardInternal(id, form.internal, slug);
      if (!ir.ok) return fail(ir.error);
      land((f) => ({ ...f, origInternal: form.internal }));
    }
    ok = true;
  }, fail).then(() => ok);
}
