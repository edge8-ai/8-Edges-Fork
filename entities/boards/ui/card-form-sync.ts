import { SUBJECT_BACKLOG_ITEM, cardBuildSummary, cardPrUrl } from "@/entities/boards/lib/types";
import type { WorkboardBoard } from "@/entities/boards/lib/workboard";
import { INTERNAL, type Card, type Form } from "./board-view-types";

/** The drawer's form for a saved card, exactly as the card holds it now. */
export function formFromCard(c: Card, board: WorkboardBoard | undefined): Form {
  return {
    id: c.id,
    boardId: c.board_id ?? "",
    clientId: board?.client_company_id ?? INTERNAL,
    laneId: c.columnId,
    title: c.title,
    priority: c.priority,
    assigneeId: c.assignee_id ?? "",
    origAssigneeId: c.assignee_id ?? "",
    handoverNote: "",
    dueDate: c.due_date ?? "",
    humanTokens: c.human_tokens == null ? "" : String(c.human_tokens),
    origHumanTokens: c.human_tokens == null ? "" : String(c.human_tokens),
    description: c.description ?? "",
    prUrl: cardPrUrl(c),
    buildSummary: cardBuildSummary(c),
    sprintId: c.sprint_id ?? "",
    origSprintId: c.sprint_id ?? "",
    epicId: c.epic_id ?? "",
    origEpicId: c.epic_id ?? "",
    subjectType: c.subject_type,
    subjectLabel: c.subject_label,
    roadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? (c.subject_id ?? "") : "",
    origRoadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? (c.subject_id ?? "") : "",
    internal: c.internal,
    origInternal: c.internal,
  };
}

/** Two forms say the same thing, field by field. Every field is a primitive. */
export function sameForm(a: Form, b: Form): boolean {
  return (Object.keys(a) as (keyof Form)[]).every((k) => a[k] === b[k]);
}

/**
 * The open drawer after the live card changed under it (W.131).
 *
 * The drawer copies the card into its form once, at open, and the server may
 * move on while it stays open: clearing the last sized subtask clears the
 * parent's estimate, another person renames the card. A field the person has
 * not touched — it still holds what the drawer opened with — takes the live
 * value, so the drawer shows the card as it is; a field they have edited is
 * theirs and is kept. The `orig*` fields always follow the live card, because
 * they say what the server holds, which is what Save compares against: an
 * edited assignee against the live one is still a handover, and an untouched
 * estimate stays unsent (W.130).
 *
 * `opened` is the form the drawer last took from the live card; the caller
 * replaces it with `fresh` afterwards. Returns `form` itself when nothing
 * changes, so a render that resyncs nothing sets no state.
 */
export function resyncForm(form: Form, opened: Form, fresh: Form): Form {
  let next: Form | null = null;
  for (const key of Object.keys(fresh) as (keyof Form)[]) {
    const follows = key.startsWith("orig") || form[key] === opened[key];
    if (follows && form[key] !== fresh[key]) next = { ...(next ?? form), [key]: fresh[key] };
  }
  return next ?? form;
}
