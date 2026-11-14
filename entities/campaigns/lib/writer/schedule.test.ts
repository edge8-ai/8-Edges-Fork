import { describe, expect, it } from "vitest";
import { startsWithinWindow } from "./schedule";

describe("startsWithinWindow", () => {
  it("drafts the day before the start date and on the day itself", () => {
    expect(startsWithinWindow("2026-09-16", "2026-09-15")).toBe(true);
    expect(startsWithinWindow("2026-09-16", "2026-09-16")).toBe(true);
  });
  it("leaves campaigns that start later, started earlier, or have no date", () => {
    expect(startsWithinWindow("2026-09-16", "2026-09-14")).toBe(false);
    expect(startsWithinWindow("2026-09-16", "2026-09-17")).toBe(false);
    expect(startsWithinWindow(null, "2026-09-15")).toBe(false);
  });
});
