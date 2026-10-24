import { cleanTokens } from "@/entities/boards/lib/tokens";
import { externalHref } from "@/kernel/ui/url";
import type { Form } from "./board-view-types";

// What the card drawer saves on its own, and when (TH.3.2, after ClickUp: an
// existing card has no Save button, the drawer says Saved / Saving… / Couldn't
// save). The rules are kept here, apart from the timers that apply them, so
// they can be read and tested as rules.

/** The fields an existing card's drawer writes. Everything else in Form is bookkeeping. */
export const SAVED_FIELDS = [
  "title",
  "description",
  "priority",
  "assigneeId",
  "dueDate",
  "humanTokens",
  "prUrl",
  "buildSummary",
  "sprintId",
  "epicId",
  "roadmapItemId",
  "internal",
] as const satisfies readonly (keyof Form)[];
export type SavedField = (typeof SAVED_FIELDS)[number];

/**
 * Typed fields wait for a pause in typing; a pick saves at once. A pause
 * rather than every keystroke, because every save is an audit row on the card
 * and a "Saved" that flickers on each letter tells nobody anything.
 */
const TYPED: ReadonlySet<keyof Form> = new Set(["title", "description", "humanTokens", "buildSummary", "handoverNote"]);
export const PICK_DELAY_MS = 300;
export const TYPING_DELAY_MS = 1200;
/**
 * A handover waits this long for its line (W.60) before it goes without one.
 * The line rides in the same message as the reassignment, so saving the pick
 * at once would send the message before the person had a chance to write it.
 */
export const HANDOVER_WAIT_MS = 4000;

/**
 * A field as the server will store it, so a value the server only tidies is
 * not "unsaved". The actions trim text, snap an estimate to the 0.05 grid and
 * store a pasted address as a full link; comparing raw values would see the
 * tidied copy as a difference, save again, and never settle.
 */
export function stored(field: SavedField, value: Form[SavedField]): string | boolean {
  if (typeof value === "boolean") return value;
  if (field === "humanTokens") return value.trim() === "" ? "" : String(cleanTokens(Number(value)));
  if (field === "prUrl") return externalHref(value) ?? value.trim();
  return value.trim();
}

/**
 * What the server holds for a field. The estimate, sprint, epic, roadmap item
 * and internal flag compare against their `orig*` fields, which follow the
 * live card and are moved forward as each write lands; the rest against the
 * form the drawer last took from the live card.
 */
export function serverHolds(field: SavedField, form: Form, opened: Form): Form[SavedField] {
  switch (field) {
    case "humanTokens":
      return form.origHumanTokens;
    case "sprintId":
      return form.origSprintId;
    case "epicId":
      return form.origEpicId;
    case "roadmapItemId":
      return form.origRoadmapItemId;
    case "internal":
      return form.origInternal;
    default:
      return opened[field];
  }
}

/**
 * The fields of a saved card that still differ from the server, leaving out
 * what was just sent and has not come back yet (`sent`, by stored value) —
 * the board refreshes after each write, and until it has, the drawer would
 * otherwise send the same value twice. A blank title is never sent: the card
 * keeps its old one until a new one is typed.
 */
export function unsavedFields(form: Form, opened: Form, sent: Partial<Record<SavedField, string | boolean>>): SavedField[] {
  return SAVED_FIELDS.filter((field) => {
    if (field === "title" && form.title.trim() === "") return false;
    const now = stored(field, form[field]);
    if (now === stored(field, serverHolds(field, form, opened))) return false;
    return !(field in sent) || sent[field] !== now;
  });
}

/** A reassignment to somebody else, which carries a line for them (W.60). */
export function handoverPending(form: Form, viewerPersonId: string | null): boolean {
  return form.id !== null && form.assigneeId !== form.origAssigneeId && form.assigneeId !== "" && form.assigneeId !== viewerPersonId;
}

/** The fields an edit changed, so the timer knows what kind of edit it was. */
export function changedBy(before: Form | null, after: Form | null): (keyof Form)[] {
  if (!before || !after || before.id !== after.id) return [];
  return (Object.keys(after) as (keyof Form)[]).filter((k) => before[k] !== after[k]);
}

/** How long to wait after an edit before saving it. */
export function delayFor(changed: (keyof Form)[], after: Form, viewerPersonId: string | null): number {
  if (changed.includes("assigneeId") && handoverPending(after, viewerPersonId)) return HANDOVER_WAIT_MS;
  return changed.some((k) => TYPED.has(k)) ? TYPING_DELAY_MS : PICK_DELAY_MS;
}

type Touched = Partial<Record<SavedField, string | boolean>>;

/**
 * The fields the person edited and the server has not yet confirmed, after an
 * edit (TH.3.2). The resync keeps these, so an edit undone while its save is
 * out is not overwritten by the refresh of the first value. An edit back to
 * what the server holds, with no save of that field unanswered, is no edit:
 * the field follows the live card again, so another person's later change to
 * it shows instead of being saved over.
 */
export function touchedAfterEdit(
  changed: (keyof Form)[],
  after: Form,
  opened: Form,
  unconfirmed: (k: SavedField) => boolean,
): (touched: Touched) => Touched {
  const mine = changed.filter((k): k is SavedField => (SAVED_FIELDS as readonly string[]).includes(k));
  const settled = mine.filter((k) => stored(k, after[k]) === stored(k, serverHolds(k, after, opened)) && !unconfirmed(k));
  return (touched) => {
    if (mine.length === 0) return touched;
    const next = { ...touched };
    for (const k of mine) {
      if (settled.includes(k)) delete next[k];
      else next[k] = stored(k, after[k]);
    }
    return next;
  };
}

/** What the drawer says about saving, at the end of the PR row. */
export type SaveState = "saved" | "saving" | "failed";
