import { describe, expect, it } from "vitest";
import { sprintCommitment } from "./sprint-commitment";

const card = (columnId: string, human_tokens: number | null) => ({ columnId, human_tokens });

describe("sprintCommitment (W.98)", () => {
  it("sums what is being committed, on the Human Token grid", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point; the grid is not.
    expect(sprintCommitment([card("next", 0.1), card("next", 0.2)])).toEqual({ cards: 2, unsized: 0, tokens: 0.3 });
  });

  it("withholds the sum and counts the unsized when an estimate is missing", () => {
    // The production case: 14 committed, 7 unsized, and the old line printed
    // 10.9 HT as though that were the size of the commitment.
    expect(sprintCommitment([card("next", null), card("next", 1.25)])).toEqual({ cards: 2, unsized: 1, tokens: null });
  });

  it("names every card when none is sized, rather than printing zero", () => {
    expect(sprintCommitment([card("next", null), card("next", null)])).toEqual({ cards: 2, unsized: 2, tokens: null });
  });

  it("has no sum for an empty commitment", () => {
    expect(sprintCommitment([])).toEqual({ cards: 0, unsized: 0, tokens: null });
  });

  it("ignores every other planning column — the backlog and last week are not a commitment", () => {
    const cards = [card("open", 9), card("done", 5), card("open", null)];
    expect(sprintCommitment(cards)).toEqual({ cards: 0, unsized: 0, tokens: null });
  });

  it("carries no person column, so no read of it can be sliced by whose card it was", () => {
    expect(Object.keys(sprintCommitment([card("next", 1)])).sort()).toEqual(["cards", "tokens", "unsized"]);
  });
});
