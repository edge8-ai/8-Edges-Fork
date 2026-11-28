import { describe, expect, it } from "vitest";
import { WAREHOUSE_PROFILE } from "../lib/__fixtures__/warehouse";
import { parseProfile, type Profile } from "../lib/profile";
import {
  blankRule,
  blankZone,
  fieldName,
  issuesAt,
  linesFrom,
  listFrom,
  moveAt,
  optionalNumber,
  optionsFrom,
  requiredNumber,
  sameProfile,
  withMoveKind,
} from "./profile-draft";

// The profile editor's draft (RP.6): what a typed value becomes, and how a
// refusal is put beside its field and named in the editor's words.
function mustParse(input: unknown): Profile {
  const parsed = parseProfile(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.profile;
}
const profile = mustParse(WAREHOUSE_PROFILE);

function refusal(draft: Profile) {
  const parsed = parseProfile(draft);
  if (parsed.ok) throw new Error("the draft was accepted");
  return parsed.issues;
}

describe("a broken pattern is refused", () => {
  it("names the pattern's field, beside it and in words", () => {
    const draft = structuredClone(profile);
    draft.zones[0].pattern = "^P(?<aisle>\\d{2}";
    const issues = refusal(draft);
    expect(issuesAt(issues, "zones.0.pattern")).toEqual(["is not a valid pattern."]);
    expect(issuesAt(issues, "zones.1.pattern")).toEqual([]);
    expect(fieldName(issues[0].path, draft)).toBe("Zone “Pick face”: pattern");
  });
});

describe("issuesAt", () => {
  it("gives a cell the issues inside it, so the move shows a mistyped option", () => {
    const draft = structuredClone(profile);
    draft.rules[0].bands[1].move = { kind: "choice", options: [8, requiredNumber("x")] };
    expect(issuesAt(refusal(draft), "rules.0.bands.1.move")).toEqual(["Enter a number."]);
  });

  it("says a blank required field is required", () => {
    const draft = structuredClone(profile);
    draft.columns.qty = "";
    expect(issuesAt(refusal(draft), "columns.qty")).toEqual(["Required."]);
  });
});

describe("fieldName", () => {
  it.each([
    ["columns.location", "Location column"],
    ["truncatedAtOrBelow", "Cut-off warning"],
    ["zones", "Zones"],
    ["zones.1.walk", "Zone “Upper”: walk by"],
    ["exclude.0.regex", "Always leave out, test “Socks”: pattern"],
    ["rules.0.size", "Rule “Kestrel”: size pattern"],
    ["rules.0.when.0.contains", "Rule “Kestrel”: applies when, test “Kestrel”: words"],
    ["rules.0.bands.1.move", "Rule “Kestrel”, band “EU 43-44”: amount to move"],
    ["rules.0.bands.1.move.options.1", "Rule “Kestrel”, band “EU 43-44”: amount to move"],
    ["destinations.count", "How many BINs to suggest"],
    ["words.noPickNote", "When an item has no pick BIN"],
    ["zones.0.label", "Zone “Pick face”: name"],
    ["rules.0.label", "Rule “Kestrel”: name"],
    ["something.else", "something.else"],
  ])("names %s as %j", (path, words) => {
    expect(fieldName(path, profile)).toBe(words);
  });

  it("numbers an entry that has no name yet", () => {
    const draft = structuredClone(profile);
    draft.rules.push(blankRule(draft.rules));
    expect(fieldName("rules.1.bands.0.reorderBelow", draft)).toBe("Rule 2, band 1: restock threshold");
  });
});

describe("typed values", () => {
  it("reads numbers, options, lists and lines the way the inputs are typed", () => {
    expect(requiredNumber("")).toBeNaN();
    expect(requiredNumber("12")).toBe(12);
    expect(optionalNumber(" ")).toBeUndefined();
    expect(optionalNumber("43")).toBe(43);
    expect(optionsFrom("8, 12")).toEqual([8, 12]);
    expect(optionsFrom("8 12 ")).toEqual([8, 12]);
    expect(listFrom("aisle, bay,")).toEqual(["aisle", "bay"]);
    expect(linesFrom("First.\n\n  Second. \n")).toEqual(["First.", "Second."]);
  });

  it("keeps the amount when a move switches kind", () => {
    expect(withMoveKind({ kind: "fixed", qty: 12 }, "choice")).toEqual({ kind: "choice", options: [12] });
    expect(withMoveKind({ kind: "choice", options: [8, 12] }, "fixed")).toEqual({ kind: "fixed", qty: 8 });
  });

  it("moves a rule up or down, and leaves the list alone at either end", () => {
    expect(moveAt(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveAt(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("blank parts", () => {
  it("adds a zone with an unused id, walked after the reserve zones there are", () => {
    const zone = blankZone(profile.zones);
    expect(zone.id).not.toBe("upper");
    expect(zone).toMatchObject({ role: "reserve", rank: 1 });
  });

  it("adds a rule turned off, so it decides no item until it is ready", () => {
    expect(blankRule(profile.rules)).toMatchObject({ enabled: false, id: "rule-2" });
  });
});

describe("sameProfile", () => {
  it("sees no change in key order or an absent field, and sees a changed threshold", () => {
    // The same rules with their keys in another order and an absent field spelled out.
    const reordered = { ...structuredClone(profile), rules: profile.rules.map(({ id, bands, ...rest }) => ({ bands, ...rest, require: undefined, id })) };
    expect(sameProfile(reordered, profile)).toBe(true);
    const edited = structuredClone(profile);
    edited.rules[0].bands[0].reorderBelow = 20;
    expect(sameProfile(edited, profile)).toBe(false);
  });
});
