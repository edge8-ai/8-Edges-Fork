import { describe, expect, it } from "vitest";
import type { FilterPart } from "./workboard-filter-parts";
import { clearFiltersLabel, emptyColumnLabel, emptyRowLabel, filteredToNothingLine } from "./workboard-empty";

// What the empty states promise (W.47): an empty column says what belongs in
// it, a filtered-to-nothing board names the filters responsible and carries
// one button that undoes them, and a board with no cards at all says neither.

const part = (label: string): FilterPart => ({ key: label, label, remove: () => {} });

describe("emptyColumnLabel", () => {
  it("names the column, so an empty one says what belongs in it", () => {
    expect(emptyColumnLabel("Review", false)).toBe("Nothing in Review");
  });

  it("blames the filters when they are what emptied the column", () => {
    expect(emptyColumnLabel("Review", true)).toBe("Nothing in Review matches the filters");
  });
});

describe("emptyRowLabel", () => {
  it("separates a board with no cards from a filter that matched none", () => {
    expect(emptyRowLabel(false, false)).toBe("No cards on this board yet.");
    expect(emptyRowLabel(false, true)).toBe("No cards on this board yet.");
    expect(emptyRowLabel(true, true)).toBe("No cards match the filters.");
  });
});

describe("filteredToNothingLine", () => {
  it("says the board is not empty, and names the one filter that emptied it", () => {
    expect(filteredToNothingLine(371, [part("W38")])).toBe("None of the 371 cards on this board match W38.");
  });

  it("joins several filters the way a sentence does", () => {
    expect(filteredToNothingLine(12, [part("Acme"), part("Dave"), part("“drag”")])).toBe(
      "None of the 12 cards on this board match Acme, Dave and “drag”.",
    );
  });

  it("agrees with itself about a board holding one card", () => {
    expect(filteredToNothingLine(1, [part("W38")])).toBe("The one card on this board does not match W38.");
  });
});

describe("clearFiltersLabel", () => {
  it("says how much the button undoes, so one filter is not cleared as if it were seven", () => {
    expect(clearFiltersLabel([part("W38")])).toBe("Clear this filter");
    expect(clearFiltersLabel([part("W38"), part("Dave")])).toBe("Clear all filters");
  });
});
