import { describe, expect, it } from "vitest";
import { DONE_SHOWN, PROMISED, PROMISED_SHOWN, foldBoard, type FoldCard } from "./board-fold";

const card = (id: string, columnId: string, createdAt: string, statusUpdatedAt: string | null = null): FoldCard => ({
  id,
  columnId,
  createdAt,
  statusUpdatedAt,
});

describe("foldBoard", () => {
  it("shows the newest few of Done and hides the rest", () => {
    const cards = ["a", "b", "c", "d", "e"].map((id, i) =>
      card(id, "done", `2026-09-0${i + 1}T00:00:00Z`, `2026-09-0${i + 1}T00:00:00Z`),
    );
    const fold = foldBoard(cards, { done: false, promised: false });
    // Newest first: e, d, c show; b and a fold away.
    expect([...fold.hidden].sort()).toEqual(["a", "b"]);
    expect(cards.length - fold.hidden.size).toBe(DONE_SHOWN);
  });

  it("orders Done by when each card last moved, not when it was made", () => {
    // The three that show should be the three just KEPT, so an old commitment
    // finished today outranks a new one finished last week.
    const cards = [
      card("old-but-just-kept", "done", "2026-01-01T00:00:00Z", "2026-09-18T00:00:00Z"),
      card("new-kept-a-while-ago", "done", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z"),
      card("kept-yesterday", "done", "2026-05-01T00:00:00Z", "2026-09-17T00:00:00Z"),
      card("kept-long-ago", "done", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"),
    ];
    const fold = foldBoard(cards, { done: false, promised: false });
    expect(fold.hidden.has("old-but-just-kept")).toBe(false);
    expect(fold.hidden.has("kept-long-ago")).toBe(true);
  });

  it("falls back to when a card was made where it never moved", () => {
    const cards = [
      card("newest", "done", "2026-09-05T00:00:00Z"),
      card("middle", "done", "2026-09-03T00:00:00Z"),
      card("older", "done", "2026-09-02T00:00:00Z"),
      card("oldest", "done", "2026-09-01T00:00:00Z"),
    ];
    const fold = foldBoard(cards, { done: false, promised: false });
    expect([...fold.hidden]).toEqual(["oldest"]);
  });

  it("folds the promised column one card later than Done", () => {
    const cards = ["p1", "p2", "p3", "p4", "p5"].map((id, i) =>
      card(id, PROMISED, `2026-09-0${i + 1}T00:00:00Z`),
    );
    const fold = foldBoard(cards, { done: false, promised: false });
    expect(cards.length - fold.hidden.size).toBe(PROMISED_SHOWN);
  });

  it("hides nothing in a column that has been expanded", () => {
    const cards = ["a", "b", "c", "d", "e"].map((id, i) => card(id, "done", `2026-09-0${i + 1}T00:00:00Z`));
    expect(foldBoard(cards, { done: true, promised: false }).hidden.size).toBe(0);
  });

  it("counts every card in a column, expanded or not, so the footer never shifts", () => {
    const cards = [
      ...["a", "b", "c", "d", "e"].map((id, i) => card(id, "done", `2026-09-0${i + 1}T00:00:00Z`)),
      ...["p1", "p2"].map((id, i) => card(id, PROMISED, `2026-09-0${i + 1}T00:00:00Z`)),
      card("live", "on_it", "2026-09-01T00:00:00Z"),
    ];
    const closed = foldBoard(cards, { done: false, promised: false });
    const open = foldBoard(cards, { done: true, promised: true });
    expect(closed.doneTotal).toBe(5);
    expect(open.doneTotal).toBe(5);
    expect(closed.promisedTotal).toBe(2);
  });

  it("never folds a working column", () => {
    const cards = ["a", "b", "c", "d", "e", "f"].map((id, i) => card(id, "on_it", `2026-09-0${i + 1}T00:00:00Z`));
    expect(foldBoard(cards, { done: false, promised: false }).hidden.size).toBe(0);
  });
});
