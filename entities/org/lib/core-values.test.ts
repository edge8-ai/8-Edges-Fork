import { describe, expect, it } from "vitest";
import { assignMarks, ordinal, reorderRefusal, tileSpan } from "./core-values";

const live = [
  { id: "a", title: "Leverage Intelligence" },
  { id: "b", title: "Deliver Impact" },
  { id: "c", title: "Communicate Transparently" },
  { id: "d", title: "Act With Ownership" },
  { id: "e", title: "Learn and Share" },
  { id: "f", title: "Have Fun Building" },
];

describe("assignMarks", () => {
  it("gives each of today's values the drawing that matches its meaning", () => {
    expect(Object.fromEntries(assignMarks(live))).toEqual({
      a: "spark",
      b: "target",
      c: "bubbles",
      d: "flag",
      e: "book",
      f: "blocks",
    });
  });

  it("keeps every mark when the order changes, because marks follow the value, not its place", () => {
    const reordered = [live[3], live[0], live[5], live[1], live[4], live[2]];
    expect(Object.fromEntries(assignMarks(reordered))).toEqual(Object.fromEntries(assignMarks(live)));
  });

  it("gives a value with no keyword the next mark nobody holds", () => {
    const m = assignMarks([{ id: "a", title: "Leverage Intelligence" }, { id: "x", title: "Be Kind" }, { id: "y", title: "Stay Humble" }]);
    expect(m.get("a")).toBe("spark");
    expect(new Set([m.get("x"), m.get("y")]).size).toBe(2);
    expect([m.get("x"), m.get("y")]).not.toContain("spark");
  });

  it("starts reusing marks only past six values", () => {
    const seven = [...live, { id: "g", title: "Be Kind" }];
    expect(new Set([...assignMarks(seven).values()]).size).toBe(6);
    expect(assignMarks(seven).get("g")).toBeDefined();
  });
});

describe("tileSpan", () => {
  it("lays six values out as the approved bento", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => tileSpan(i, 6))).toEqual(["wide", "tall", "", "", "", "wide"]);
  });

  it("never leaves one tile alone on the last row", () => {
    expect(tileSpan(3, 4)).toBe("full");
    expect(tileSpan(0, 5)).toBe("wide");
    expect([0, 1, 2].map((i) => tileSpan(i, 3))).toEqual(["", "", ""]);
  });
});

describe("ordinal", () => {
  it("spells small numbers and falls back to digits", () => {
    expect(ordinal(1)).toBe("one");
    expect(ordinal(6)).toBe("six");
    expect(ordinal(12)).toBe("12");
  });
});

describe("reorderRefusal", () => {
  it("accepts the same values in a new order", () => {
    expect(reorderRefusal(["a", "b", "c"], ["c", "a", "b"])).toBeNull();
  });

  it("refuses a list that lost, gained or repeated a value", () => {
    expect(reorderRefusal(["a", "b", "c"], ["a", "b"])).toMatch(/changed/);
    expect(reorderRefusal(["a", "b"], ["a", "b", "z"])).toMatch(/changed/);
    expect(reorderRefusal(["a", "b", "c"], ["a", "a", "b"])).toMatch(/changed/);
  });
});
