import { describe, expect, it } from "vitest";
import { attendedBy } from "./session-attendance";

describe("attendedBy", () => {
  it("matches an exact name", () => {
    expect(attendedBy(["Robin Tran", "Sam Le"], ["Robin Tran"])).toBe(true);
  });

  it("ignores case and stray whitespace, which is all Zoom gives us", () => {
    expect(attendedBy(["  robin   tran "], ["Robin Tran"])).toBe(true);
  });

  it("drops a parenthetical, because people put their team in it", () => {
    expect(attendedBy(["Robin Tran (Delivery)"], ["Robin Tran"])).toBe(true);
  });

  it("matches a preferred name when the full name is what Zoom saw", () => {
    expect(attendedBy(["Nguyen Van An"], ["Nguyen Van An", "Andy"])).toBe(true);
    expect(attendedBy(["Andy"], ["Nguyen Van An", "Andy"])).toBe(true);
  });

  it("says no when nobody by that name spoke", () => {
    expect(attendedBy(["Sam Le", "Robin Tran"], ["Chris Doan"])).toBe(false);
  });

  it("says no for an empty speaker list", () => {
    expect(attendedBy([], ["Robin Tran"])).toBe(false);
  });

  // Matching on a single letter would put every session in somebody's history.
  it("refuses to match on a one-character name", () => {
    expect(attendedBy(["Sam Le", "Robin Tran"], ["A"])).toBe(false);
  });

  it("says no when we hold no name at all", () => {
    expect(attendedBy(["Sam Le"], [null, ""])).toBe(false);
  });
});
