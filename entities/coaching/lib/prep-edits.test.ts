import { describe, expect, it } from "vitest";
import { applyMemberEdits, normaliseEdits, parsePrepBullets, validatePrepEdits } from "./prep-edits";

describe("parsePrepBullets", () => {
  it("keeps top-level bullets in order and ignores headings and prose", () => {
    const md = "## Agenda\n- How the goal moved\n* The staging blocker\nSome prose\n  - nested is fine too\n";
    expect(parsePrepBullets(md)).toEqual(["How the goal moved", "The staging blocker", "nested is fine too"]);
    expect(parsePrepBullets(null)).toEqual([]);
  });
});

describe("applyMemberEdits", () => {
  it("marks struck bullets, appends the member's lines, and drops a strike that no longer matches", () => {
    const lines = applyMemberEdits(["A", "B"], { struck: ["B", "gone"], added: ["Mine"] });
    expect(lines).toEqual([
      { text: "A", struck: false, mine: false },
      { text: "B", struck: true, mine: false },
      { text: "Mine", struck: false, mine: true },
    ]);
  });
});

describe("normaliseEdits and validatePrepEdits", () => {
  it("reads sloppy JSON into clean lists", () => {
    expect(normaliseEdits({ struck: [" A ", 3, ""], added: null })).toEqual({ struck: ["A"], added: [] });
    expect(normaliseEdits(null)).toEqual({ struck: [], added: [] });
  });
  it("refuses too many or too long lines", () => {
    expect(validatePrepEdits({ struck: [], added: Array(21).fill("x") }).ok).toBe(false);
    expect(validatePrepEdits({ struck: ["y".repeat(301)], added: [] }).ok).toBe(false);
    expect(validatePrepEdits({ struck: ["A"], added: ["B"] })).toEqual({ ok: true });
  });
});
