import { describe, expect, it } from "vitest";
import { cleanTokens, formatTokens, subtaskRowsOnly, sumSubtaskTokens } from "./tokens";

describe("cleanTokens", () => {
  it("snaps to the 0.05 grid and keeps zero", () => {
    expect(cleanTokens(0.3)).toBe(0.3);
    expect(cleanTokens(0.12)).toBe(0.1);
    expect(cleanTokens(0.13)).toBe(0.15);
    expect(cleanTokens(2.5)).toBe(2.5);
    expect(cleanTokens(0)).toBe(0);
  });
  it("has no ceiling, and stores nonsense as null rather than a guess", () => {
    expect(cleanTokens(40)).toBe(40);
    expect(cleanTokens(-1)).toBeNull();
    expect(cleanTokens(NaN)).toBeNull();
    expect(cleanTokens(undefined)).toBeNull();
  });
});

describe("sumSubtaskTokens", () => {
  it("adds the sized subtasks on the grid and ignores the unsized", () => {
    expect(sumSubtaskTokens([{ human_tokens: 0.1 }, { human_tokens: 0.2 }, { human_tokens: null }])).toBe(0.3);
  });
  it("is null when no subtask is sized, so the card keeps its own figure", () => {
    expect(sumSubtaskTokens([{ human_tokens: null }])).toBeNull();
    expect(sumSubtaskTokens([])).toBeNull();
  });
});

describe("formatTokens", () => {
  it("prints the decimals an estimate carries and drops the ones it does not", () => {
    expect(formatTokens(1.5)).toBe("1.5");
    expect(formatTokens(3)).toBe("3");
    expect(formatTokens(0.05)).toBe("0.05");
    expect(formatTokens(0)).toBe("0");
  });
  it("clears the float noise a sum of grid values carries", () => {
    // 0.1 + 0.2 is 0.30000000000000004, and a page printed it.
    expect(formatTokens(0.1 + 0.2)).toBe("0.3");
    expect(formatTokens(8.200000000000001)).toBe("8.2");
  });
});

describe("subtaskRowsOnly", () => {
  it("drops blocker rows, which are child tasks too but carry no effort of the parent's", () => {
    const rows = [
      { human_tokens: 0.3, metadata: null },
      { human_tokens: 1, metadata: { kind: "blocker" } },
      { human_tokens: 0.1, metadata: {} },
    ];
    expect(sumSubtaskTokens(subtaskRowsOnly(rows))).toBe(0.4);
  });
});
