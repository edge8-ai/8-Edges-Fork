import { describe, expect, it } from "vitest";
import { parseProfile } from "./profile";

// What a manager's save or import is checked against before anything is
// stored. A refusal names the field, so the editor can point at it.
const valid = {
  columns: { item: "Item", description: "Description", location: "Bin", qty: "On hand" },
  truncatedAtOrBelow: 1000,
  zones: [
    { id: "pick", label: "Pick face", role: "pick", rank: 0, pattern: "^P(?<aisle>\\d{2})-(?<bay>\\d{2})$", walk: ["aisle", "bay"] },
    { id: "upper", label: "Upper", role: "reserve", rank: 0, pattern: "^U(?<aisle>\\d{2})$", walk: ["aisle"] },
  ],
  exclude: [{ contains: "socks", label: "Socks" }],
  rules: [
    {
      id: "kestrel",
      label: "Kestrel",
      enabled: true,
      when: [{ contains: "kestrel", label: "Kestrel" }],
      size: "(?<size>\\d{2})\\s*(R|N|W)\\s*$",
      bands: [{ label: "EU 43-44", min: 43, max: 44, reorderBelow: 16, move: { kind: "choice", options: [8, 12] } }],
    },
  ],
  destinations: { count: 3, from: "furthest" },
  words: {
    pick: "Pick face",
    reserve: "Reserve",
    instructions: ["Work the jobs in order."],
    destinationRule: "Start with Destination 1.",
    noPickNote: "No pick BIN yet.",
    choiceHint: "The box decides.",
    footer: null,
  },
};

type Json = Record<string, unknown>;
const clone = (): Json => JSON.parse(JSON.stringify(valid)) as Json;

describe("parseProfile", () => {
  it("accepts a complete profile", () => {
    const parsed = parseProfile(valid);
    expect(parsed.ok).toBe(true);
  });

  it.each<[string, (p: Json) => void, RegExp]>([
    ["a missing column heading", (p) => { delete (p.columns as Json).location; }, /columns\.location/],
    ["a band with no move", (p) => { delete ((p.rules as Json[])[0].bands as Json[])[0].move; }, /rules\.0\.bands\.0\.move/],
    ["a choice with one option", (p) => { (((p.rules as Json[])[0].bands as Json[])[0].move as Json).options = [8]; }, /rules\.0\.bands\.0\.move/],
    ["a zone pattern that is not a valid pattern", (p) => { (p.zones as Json[])[0].pattern = "^P(?<aisle>\\d{2}"; }, /zones\.0\.pattern/],
    ["a zone walking by a group its pattern does not name", (p) => { (p.zones as Json[])[1].walk = ["aisle", "bay"]; }, /zones\.1\.walk/],
    ["a size pattern with no size group", (p) => { (p.rules as Json[])[0].size = "(\\d{2})\\s*R$"; }, /rules\.0\.size/],
    ["an exclusion that tests nothing", (p) => { (p.exclude as Json[])[0] = { label: "Empty" }; }, /exclude\.0/],
    ["no pick zone", (p) => { p.zones = [(p.zones as Json[])[1]]; }, /zones/],
  ])("refuses %s, naming the field", (_case, breakIt, field) => {
    const p = clone();
    breakIt(p);
    const parsed = parseProfile(p);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(field);
      // The same paths as a list, which the editor puts beside each field.
      expect(parsed.issues.some((issue) => field.test(issue.path))).toBe(true);
    }
  });
});
