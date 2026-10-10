// Cards and Human Tokens per epic, for the epics page. A card's tokens are its own
// figure: when a card has sized subtasks that figure is already their sum (the boards
// action derives it on every subtask save), so adding the subtasks again would double
// count. Archived cards never reach here.

export type EpicTotals = { open: number; done: number; openTokens: number; doneTokens: number };

type CountedCard = {
  epic_id: string | null;
  status: string;
  human_tokens: number | null;
};

export const zeroTotals = (): EpicTotals => ({ open: 0, done: 0, openTokens: 0, doneTokens: 0 });

function cardTokens(card: CountedCard): number {
  return card.human_tokens ?? 0;
}

function add(into: EpicTotals, card: CountedCard) {
  const tokens = cardTokens(card);
  if (card.status === "done") {
    into.done += 1;
    into.doneTokens += tokens;
  } else if (card.status !== "not_doing") {
    // Not Doing counts on neither side: it is not left to do and was not done.
    into.open += 1;
    into.openTokens += tokens;
  }
}

export function epicTotals(cards: CountedCard[]): { byEpic: Map<string, EpicTotals>; none: EpicTotals; total: EpicTotals } {
  const byEpic = new Map<string, EpicTotals>();
  const none = zeroTotals();
  const total = zeroTotals();
  for (const card of cards) {
    add(total, card);
    if (!card.epic_id) {
      add(none, card);
      continue;
    }
    const t = byEpic.get(card.epic_id) ?? zeroTotals();
    add(t, card);
    byEpic.set(card.epic_id, t);
  }
  return { byEpic, none, total };
}
