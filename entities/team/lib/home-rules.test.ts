import { describe, expect, it } from "vitest";
import { isNewFace } from "./home-people";

// The small rules the team Home stands on (TH.1). Each one decides something a
// person sees about themselves or a teammate, so each is pinned here.

describe("new faces (TH.1.6)", () => {
  it("marks a joiner new for 45 days and no longer", () => {
    expect(isNewFace("2026-09-03", "2026-10-09")).toBe(true);
    expect(isNewFace("2026-08-25", "2026-10-09")).toBe(true);
    expect(isNewFace("2026-08-24", "2026-10-09")).toBe(false);
  });

  it("never marks someone who has not started yet, or has no start date", () => {
    expect(isNewFace("2026-10-20", "2026-10-09")).toBe(false);
    expect(isNewFace(null, "2026-10-09")).toBe(false);
  });
});
