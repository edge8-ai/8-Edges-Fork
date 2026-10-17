import { describe, expect, it } from "vitest";
import { nextIssueName, nextLetterName } from "./broadcast-names";

describe("nextLetterName", () => {
  it("starts at 01", () => {
    expect(nextLetterName([])).toBe("The Edge 01");
  });

  it("follows the highest number used, whatever else is named", () => {
    expect(nextLetterName(["The Edge 01: The Hard Truth", "Weekly digest · 2026-09-17", "The Edge 03"])).toBe("The Edge 04");
  });

  it("does not reuse a number a renamed or deleted letter left behind", () => {
    expect(nextLetterName(["The Edge 02"])).toBe("The Edge 03");
  });

  it("keeps counting past 99", () => {
    expect(nextLetterName(["The Edge 99"])).toBe("The Edge 100");
  });
});

describe("nextIssueName", () => {
  it("numbers a series by its own name and ignores the letters", () => {
    expect(nextIssueName("Weekly", ["The Edge 04", "Weekly 01", "Weekly 02"])).toBe("Weekly 03");
  });

  it("does not read a longer name that merely starts the same way", () => {
    expect(nextIssueName("Weekly", ["Weekly digest 07"])).toBe("Weekly 01");
  });
});
