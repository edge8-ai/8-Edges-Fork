// Which cards the commitment board folds away behind "Show N older".
//
// Two columns grow without bound — Done, and the read-only column holding what
// the other side promised — so both show their newest few and hide the rest.
// The hidden cards stay MOUNTED and are hidden by CSS: the column header's
// count has to be the real number of commitments kept, not the number currently
// on screen, and dropping a card from the list would take the count with it.
//
// Pure, and split out of CommitmentBoard because it is arithmetic over dates
// and counts sitting in a component otherwise concerned with drag, toast and
// sort. Nothing here counts a person: these are cards in a column.

/** The read-only column, where the OTHER side's promises are displayed. */
export const PROMISED = "promised";

export const DONE_SHOWN = 3;
// The other side's promises fold a little later: four fits the same space, and
// that column is read rather than worked, so scrolling it is the rarer job.
export const PROMISED_SHOWN = 4;

export type FoldCard = {
  id: string;
  columnId: string;
  statusUpdatedAt: string | null;
  createdAt: string;
};

export type Fold = {
  /** Card ids to render hidden. */
  hidden: Set<string>;
  /** Every card in each foldable column, expanded or not — what the footer's
   *  "Show N older" is counted from, so the number never changes as the column
   *  opens and closes. */
  doneTotal: number;
  promisedTotal: number;
};

// Newest first. Done is ordered by when each card last MOVED, so the three that
// show are the three just kept; a promise has no such moment of its own, so it
// falls back to when it was made.
function newestFirst(cards: FoldCard[], byMove: boolean): FoldCard[] {
  return [...cards].sort((a, b) =>
    byMove
      ? (b.statusUpdatedAt ?? b.createdAt).localeCompare(a.statusUpdatedAt ?? a.createdAt)
      : b.createdAt.localeCompare(a.createdAt),
  );
}

/** Everything the board needs to draw its two foldable columns. */
export function foldBoard(cards: FoldCard[], showAll: { done: boolean; promised: boolean }): Fold {
  const done = cards.filter((c) => c.columnId === "done");
  const promised = cards.filter((c) => c.columnId === PROMISED);
  const hidden = new Set<string>();
  if (!showAll.done) {
    for (const c of newestFirst(done, true).slice(DONE_SHOWN)) hidden.add(c.id);
  }
  if (!showAll.promised) {
    for (const c of newestFirst(promised, false).slice(PROMISED_SHOWN)) hidden.add(c.id);
  }
  return { hidden, doneTotal: done.length, promisedTotal: promised.length };
}
