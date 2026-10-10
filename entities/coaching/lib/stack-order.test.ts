import { describe, expect, it } from "vitest";
import { moveWithin, reassign, sortCards, type SortMode } from "./stack-order";

const card = (id: string, sortOrder: number, createdAt: string, dueOn: string | null = null) => ({
  id,
  sortOrder,
  createdAt,
  dueOn,
});

// Deliberately out of every order: the stack says c, a, b; the ages say b, a, c;
// the due days say a (25th), c (20th), and b has none.
const cards = [
  card("a", 0, "2026-09-10T00:00:00Z", "2026-09-25"),
  card("b", 1, "2026-09-01T00:00:00Z", null),
  card("c", -1, "2026-09-20T00:00:00Z", "2026-09-20"),
];

const ids = (mode: SortMode) => sortCards(cards, mode).map((c) => c.id);

describe("sortCards", () => {
  it("follows the drag stack by default", () => {
    expect(ids("manual")).toEqual(["c", "a", "b"]);
  });

  it("puts the soonest due day first and the undated last", () => {
    expect(ids("due-first")).toEqual(["c", "a", "b"]);
  });

  it("puts the latest due day first and still leaves the undated last", () => {
    // Undated is not the least urgent thing, it is simply not in this
    // conversation — so it does not lead the reversed list.
    expect(ids("due-last")).toEqual(["a", "c", "b"]);
  });

  it("orders by age in both directions", () => {
    expect(ids("oldest")).toEqual(["b", "a", "c"]);
    expect(ids("newest")).toEqual(["c", "a", "b"]);
  });

  it("breaks a tie with the stack rather than leaving it to chance", () => {
    const tied = [card("x", 5, "2026-09-02T00:00:00Z", "2026-09-30"), card("y", 2, "2026-09-02T00:00:00Z", "2026-09-30")];
    expect(sortCards(tied, "due-first").map((c) => c.id)).toEqual(["y", "x"]);
  });

  it("keeps the order the loader has always returned when the stack values tie", () => {
    // sort_order first, then NEWEST — matching the query, so turning this on
    // does not reshuffle a board somebody already knows.
    const tied = [card("old", 0, "2026-09-01T00:00:00Z"), card("new", 0, "2026-09-09T00:00:00Z")];
    expect(sortCards(tied, "manual").map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("does not mutate what it is given", () => {
    const before = cards.map((c) => c.id);
    sortCards(cards, "oldest");
    expect(cards.map((c) => c.id)).toEqual(before);
  });
});

describe("reassign", () => {
  it("hands the held values out in the new order", () => {
    expect(reassign(["c", "a", "b"], [{ id: "a", sortOrder: 3 }, { id: "b", sortOrder: 7 }, { id: "c", sortOrder: 5 }])).toEqual([
      { id: "c", sortOrder: 3 },
      { id: "a", sortOrder: 5 },
      { id: "b", sortOrder: 7 },
    ]);
  });

  it("separates cards that shared a value", () => {
    const out = reassign(["b", "a"], [{ id: "a", sortOrder: 4 }, { id: "b", sortOrder: 4 }]);
    expect(out.map((o) => o.sortOrder)).toEqual([4, 4]);
    expect(out.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("ignores rows the drag did not touch", () => {
    expect(reassign(["a"], [{ id: "a", sortOrder: 2 }, { id: "z", sortOrder: 0 }])).toEqual([{ id: "a", sortOrder: 2 }]);
  });

  it("keeps counting when the data has fewer rows than the client believes", () => {
    expect(reassign(["a", "b"], [{ id: "a", sortOrder: 9 }])).toEqual([
      { id: "a", sortOrder: 9 },
      { id: "b", sortOrder: 10 },
    ]);
  });
});

describe("moveWithin", () => {
  it("lifts a card to the position it was dropped at", () => {
    expect(moveWithin(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveWithin(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
  });
  it("says nothing happened when the card did not move", () => {
    expect(moveWithin(["a", "b"], "a", 0)).toBeNull();
    expect(moveWithin(["a", "b"], "z", 1)).toBeNull();
  });
});
