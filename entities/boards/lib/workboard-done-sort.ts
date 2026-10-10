import type { WorkboardCard, WorkboardLane } from "./workboard";

// The Done lane always reads newest to oldest, on every surface (admin, team,
// the client portal). Finished cards have no manual within-column order to
// preserve, so we sort them by when they were completed, most recent on top.
// Non-done lanes keep their manual order: we sort only the done cards in
// place, leaving every other card's slot untouched. Split out of workboard.ts
// for the file-size gate.
export function sortDoneNewestFirst(cards: WorkboardCard[], lanes: WorkboardLane[]): void {
  const laneIsDone = new Map(lanes.map((l) => [l.id, l.isDone]));
  const doneIndexes = cards.reduce<number[]>((acc, c, i) => {
    if (laneIsDone.get(c.laneId)) acc.push(i);
    return acc;
  }, []);
  const doneTime = (c: WorkboardCard) => c.completed_at ?? c.last_moved_at ?? c.created_at ?? "";
  const sortedDone = doneIndexes.map((i) => cards[i]).sort((a, b) => doneTime(b).localeCompare(doneTime(a)));
  doneIndexes.forEach((idx, k) => {
    cards[idx] = sortedDone[k];
  });
}
