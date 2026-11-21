import { sumSubtaskTokens } from "@/entities/boards/lib/tokens";

/**
 * What the card drawer's Save sends for the estimate (W.130).
 *
 * The drawer copies a card's figure into its form once, when the card opens,
 * and the server may change that figure while the drawer stays open: sizing a
 * subtask re-derives the parent, clearing its last sized subtask clears it,
 * and another person may do either. Sending the copy back would then say
 * something nobody typed — refused with the "sum of subtasks" error and the
 * title lost with it, or, worse, accepted, restoring a sum the server had
 * just cleared.
 *
 * So Save speaks about the estimate only when the person edited the field,
 * and never for a card whose subtasks decide its figure now. The second rule
 * is not implied by the first: a figure typed while no subtask was sized is
 * an edit, and sizing a subtask afterwards in the same drawer turns the field
 * read-only with the typed figure still in the form. Sending it would be
 * refused on every retry, since the field can no longer be changed.
 * undefined leaves the column alone; an empty field means "not estimated".
 */
export function estimateToSave(
  typed: string,
  opened: string,
  liveSubtasks: { human_tokens: number | null }[] | undefined,
): number | null | undefined {
  if (typed === opened) return undefined;
  if (liveSubtasks && sumSubtaskTokens(liveSubtasks) !== null) return undefined;
  return typed === "" ? null : Number(typed);
}
