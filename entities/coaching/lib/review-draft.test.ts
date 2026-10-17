import { describe, expect, it } from "vitest";
import { cycleNeedingDraft } from "./review-draft";

describe("cycleNeedingDraft", () => {
  it("offers a draft while the member still has writing to do", () => {
    expect(cycleNeedingDraft([{ label: "2026 H2", status: "open" }])?.label).toBe("2026 H2");
    expect(cycleNeedingDraft([{ label: "2026 H2", status: "draft" }])?.label).toBe("2026 H2");
  });

  // Past submitted it is somebody else's turn, and an offer then is noise.
  it("stays quiet once it is out of their hands", () => {
    for (const status of ["submitted", "finalized", "acknowledged"]) {
      expect(cycleNeedingDraft([{ label: "2026 H2", status }])).toBeNull();
    }
  });

  it("stays quiet when no cycle is running, which is most of the year", () => {
    expect(cycleNeedingDraft([])).toBeNull();
  });

  it("picks the one still being written when an old cycle sits beside it", () => {
    expect(
      cycleNeedingDraft([
        { label: "2026 H1", status: "acknowledged" },
        { label: "2026 H2", status: "open" },
      ])?.label,
    ).toBe("2026 H2");
  });
});
