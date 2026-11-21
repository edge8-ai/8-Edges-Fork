import { describe, expect, it } from "vitest";
import { GOES_BY_ONE_WORD, goesByProblem } from "./name-parts";

// S.23.5. Goes by is a one-word nickname. On 2026-11-16 whole names were typed
// into it from the Team drawer, and the shown-name template dropped each one,
// so the drawer now says why and offers the edit that was meant.
describe("goesByProblem — what the drawer says about a Goes by value", () => {
  const parts = { given: "Kit", family: "Võ" };

  it("has nothing to say about one word or a blank", () => {
    expect(goesByProblem("Kit", parts)).toBeNull();
    expect(goesByProblem("  ", parts)).toBeNull();
  });

  it("splits a full name with a bracketed nickname into its parts, keeping the stored accents", () => {
    expect(goesByProblem("Lan Vo (Kit)", parts)).toEqual({
      message: "“Lan Vo (Kit)” is a full name. Goes by holds one word: the name people call them.",
      fix: { label: "Use Lan as given name and Kit as goes by", patch: { first_name: "Lan", preferred_name: "Kit" } },
    });
  });

  it("keeps a given name of two words together", () => {
    expect(goesByProblem("My Linh Ho (Kit)", { given: "Mỹ Linh", family: "Hồ" })?.fix).toEqual({
      label: "Use Kit as goes by",
      patch: { preferred_name: "Kit" },
    });
  });

  it("names every part a full name would change", () => {
    expect(goesByProblem("Lan Phan (Kit)", parts)?.fix).toEqual({
      label: "Use Lan as given name, Phan as family name and Kit as goes by",
      patch: { first_name: "Lan", last_name: "Phan", preferred_name: "Kit" },
    });
  });

  it("offers a blank when the value is the given and family name again", () => {
    for (const typed of ["Kit Vo", "Vo Kit"]) {
      expect(goesByProblem(typed, parts)).toEqual({
        message: `“${typed}” is the given and family name again. Goes by holds one word, or stays blank.`,
        fix: { label: "Leave goes by blank", patch: { preferred_name: "" } },
      });
    }
  });

  it("offers a blank when the value is a two-word given name again", () => {
    expect(goesByProblem("My Linh", { given: "Mỹ Linh", family: "Hồ" })).toEqual({
      message: "“My Linh” is the given name again. Goes by holds a nickname, or stays blank.",
      fix: { label: "Leave goes by blank", patch: { preferred_name: "" } },
    });
  });

  it("reads a nickname followed by the family name as the nickname", () => {
    expect(goesByProblem("Mike Phan", { given: "Minh", family: "Phan" })?.fix).toEqual({
      label: "Use Mike as goes by",
      patch: { preferred_name: "Mike" },
    });
  });

  it("explains, with no fix, a value it cannot read", () => {
    expect(goesByProblem("Dr Kit Smith", parts)).toEqual({ message: GOES_BY_ONE_WORD, fix: null });
  });
});
