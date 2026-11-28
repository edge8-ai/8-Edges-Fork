import { describe, expect, it } from "vitest";
import { shortSprintName } from "./chip-label";

// W.103.2. The chip has to come out of this SHORT — that is the whole point —
// but it also has to still identify the sprint, so the cases here are the real
// sprint names from the 8 Edges board and the two client boards beside it, not
// invented ones.

describe("shortSprintName", () => {
  it("keeps the identifier and drops the theme", () => {
    // 244px as a chip in a 285px row, on 218 cards — the single worst offender.
    expect(shortSprintName("Sprint 3 - Clean Routines, Client Rollouts")).toBe("Sprint 3");
    // 290px: wider than the row that was meant to hold it.
    expect(shortSprintName("Sprint 3 - Support, Discussion, Student Analytics")).toBe("Sprint 3");
    expect(shortSprintName("Sprint 4 - Workboard Views And Planning")).toBe("Sprint 4");
    expect(shortSprintName("Sprint 1 - Kickoff and Data Mapping")).toBe("Sprint 1");
  });

  it("handles every dash the boards actually use, not only the hyphen", () => {
    expect(shortSprintName("Sprint 2 — Ledger Lab Consolidation")).toBe("Sprint 2");
    expect(shortSprintName("Sprint 2 – Ledger Lab Consolidation")).toBe("Sprint 2");
    expect(shortSprintName("Sprint 5 : Reporting")).toBe("Sprint 5");
  });

  it("leaves a name that is already a label alone", () => {
    expect(shortSprintName("Y26 Sprint 37")).toBe("Y26 Sprint 37");
    expect(shortSprintName("Sprint 3")).toBe("Sprint 3");
  });

  it("does not cut a hyphen that is inside a word", () => {
    // "Re-run" is one word; only a dash with space on both sides separates.
    expect(shortSprintName("Sprint 6 Re-run")).toBe("Sprint 6 Re-run");
  });

  it("returns something to read when the separator comes first", () => {
    // A chip with no text is worse than a long one, so a name that would cut
    // down to nothing is kept whole.
    expect(shortSprintName("- Clean Routines")).toBe("- Clean Routines");
    expect(shortSprintName("  Sprint 8  ")).toBe("Sprint 8");
  });
});
