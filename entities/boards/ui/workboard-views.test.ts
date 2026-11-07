import { describe, expect, it } from "vitest";
import { VIEWS } from "./workboard-filter-params";
import { viewsFor } from "./workboard-surface";

// Which views each surface offers. W.97.5 removed Calendar and Timeline and
// kept the Schedule; W.109 removed the Schedule and brought the Calendar back
// as an agenda of due dates, because the Schedule's bars started from a date
// the data does not have. Three views throughout, and the one decision that
// has survived every rearrangement is the one tested last: who may look at
// internal due dates.

describe("which views a surface offers", () => {
  it("offers exactly the three the codec knows, and nothing it does not", () => {
    expect([...VIEWS]).toEqual(["board", "list", "calendar"]);
    for (const surface of ["admin", "team", "portal"] as const) {
      for (const view of viewsFor(surface)) expect(VIEWS).toContain(view);
    }
  });

  it("gives the admin and the team hub all three", () => {
    expect(viewsFor("admin")).toEqual(["board", "list", "calendar"]);
    expect(viewsFor("team")).toEqual(["board", "list", "calendar"]);
  });

  // Khoa, 2026-09-17, carried through both replacements: a client does not
  // need internal due dates, and the Calendar is a month of exactly those.
  it("keeps the calendar off the portal", () => {
    expect(viewsFor("portal")).toEqual(["board", "list"]);
  });
});
