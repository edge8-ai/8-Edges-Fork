// The rank-up's behaviour, kept apart from its markup so it is tested without
// a DOM (LD.5), the way kernel/shell/stale-refresh.ts is: vitest runs in the
// node environment, so a component's effects never fire under test, and a
// function that takes its document and dialog as arguments can be driven by
// fakes instead. RankUpScreen.tsx calls these and holds no logic of its own.
//
// The prototype's rules: Show it is focused when the screen opens; Tab and
// Shift+Tab go round the two answers and never leave the screen; Escape is
// Later; closing gives focus back to where it was. Show it wears the tier on
// its ladder and then marks the unlock shown; Later only marks it shown.
import type { Result } from "@/kernel/data/result";
import type { Ladder } from "../lib/points";

/** The two server actions the screen answers with: the reader's own wear switch, and markShown. */
export type RankUpActions = {
  setWear: (ladder: Ladder, on: boolean) => Promise<Result>;
  markShown: (unlockIds: string[]) => Promise<Result>;
};

/** What a rank-up needs to be answered: the unlocks of the climb it marks shown and the ladder Show it wears. */
export type Answerable = { markIds: string[]; ladder: Ladder };

/**
 * Show it: wears the tier on its ladder, then marks the unlock shown. A wear
 * that fails says so and marks nothing, so the screen stays and the choice is
 * not lost. A mark that fails after the wear saved is not an error the reader
 * can act on: the tier is worn, and the screen shows once more later.
 */
export async function showIt(rankUp: Answerable, actions: RankUpActions): Promise<Result> {
  const worn = await actions.setWear(rankUp.ladder, true);
  if (!worn.ok) return worn;
  await actions.markShown(rankUp.markIds);
  return { ok: true };
}

/** Later: marks the unlock shown and wears nothing. Showing it stays a choice on the profile. */
export async function later(rankUp: Answerable, actions: RankUpActions): Promise<Result> {
  return actions.markShown(rankUp.markIds);
}

/** Something focus can land on; a button in the app, a fake in the tests. */
export type Focusable = { focus(): void };

/** The slice of a keyboard event this reads and stops. */
export type KeyLike = { key: string; shiftKey: boolean; preventDefault(): void };

/** The slice of `document` this needs. */
export type DocLike = {
  readonly activeElement: unknown;
  addEventListener(type: "keydown", listener: (event: KeyLike) => void): void;
  removeEventListener(type: "keydown", listener: (event: KeyLike) => void): void;
  /** Whether an element is still on the page, so focus is never handed to one a re-render removed. */
  contains(node: unknown): boolean;
};

export type RankUpFocus = {
  doc: DocLike;
  /** The screen's buttons, in order, read when a key is pressed: Show it, then Later. */
  buttons: () => Focusable[];
  /** Escape. */
  onLater: () => void;
};

/**
 * Opens the screen's keyboard rules: focuses Show it, keeps Tab inside the
 * screen and makes Escape Later. Returns the close, which removes them and
 * gives focus back to the element that had it when the screen opened.
 */
export function wireRankUp({ doc, buttons, onLater }: RankUpFocus): () => void {
  const before = doc.activeElement;
  buttons()[0]?.focus();
  const onKey = (event: KeyLike) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onLater();
      return;
    }
    if (event.key !== "Tab") return;
    const all = buttons();
    if (all.length === 0) return;
    // Listening on the document rather than the screen keeps Tab inside even
    // when focus has left the buttons (a click on the backdrop drops it on the
    // page behind): the next Tab comes back to the first answer.
    event.preventDefault();
    const at = all.indexOf(doc.activeElement as Focusable);
    const next = at < 0 ? (event.shiftKey ? all.length - 1 : 0) : (at + (event.shiftKey ? all.length - 1 : 1)) % all.length;
    all[next].focus();
  };
  doc.addEventListener("keydown", onKey);
  return () => {
    doc.removeEventListener("keydown", onKey);
    if (before && doc.contains(before) && typeof (before as Focusable).focus === "function") (before as Focusable).focus();
  };
}
