import { describe, expect, it } from "vitest";
import { nextWorkingDay } from "./out-today";

// Who's out on the team Home says when a person is back (TH.1.6). Leave that
// ends on a Friday means back on Monday, not Saturday.
describe("nextWorkingDay", () => {
  it("skips the weekend after a Friday", () => {
    expect(nextWorkingDay("2026-10-09")).toBe("2026-10-12");
  });

  it("is the next day midweek", () => {
    expect(nextWorkingDay("2026-10-12")).toBe("2026-10-13");
  });

  it("lands on Monday from a Saturday or a Sunday", () => {
    expect(nextWorkingDay("2026-10-10")).toBe("2026-10-12");
    expect(nextWorkingDay("2026-10-11")).toBe("2026-10-12");
  });
});
