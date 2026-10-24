import { isClosed, isDone, isSetAside } from "@/entities/boards/lib/card-stage";

// The three lists on a sprint's page (W.139).
//
// A card is open, done, or set aside in Not Doing (#1677). The page drew only
// "In play" and "Done", so a card set aside counted towards "3 / 5 done" and
// appeared in neither list: the numbers above never matched the rows below.
// The split is exhaustive on purpose — anything that is not done or set aside
// is in play — so a card can never be counted and left undrawn again.
export function sprintCardLists<C extends { status: string }>(cards: C[]): { open: C[]; done: C[]; setAside: C[] } {
  const done = cards.filter((c) => isDone(c));
  const setAside = cards.filter((c) => isSetAside(c));
  const open = cards.filter((c) => !isClosed(c));
  return { open, done, setAside };
}
