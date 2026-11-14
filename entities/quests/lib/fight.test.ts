import { describe, expect, it } from "vitest";
import { hp, monsterFor, verdictAtClose } from "./fight";

// The game's arithmetic (QS.1), as a table: HP, the close's verdict and the
// monster, with the rounding edges the prototype met (one of three, one of
// twenty-eight). Nothing scores a hit, so there is only HP to test: it is the share
// still out, and nothing else.

describe("hp", () => {
  it.each([
    [0, 3, 100],
    [1, 3, 67],
    [2, 3, 33],
    [3, 3, 0],
    [1, 28, 96],
    [12, 28, 57],
    [27, 28, 4],
    [28, 28, 0],
    [1, 2, 50],
    [1, 1, 0],
  ])("%i turned in of %i is %i HP", (turnedIn, partySize, expected) => {
    expect(hp(turnedIn, partySize)).toBe(expected);
  });

  it("is full, with no division, for a Party of nobody", () => {
    expect(hp(0, 0)).toBe(100);
  });

  it("never goes below 0", () => {
    expect(hp(5, 3)).toBe(0);
  });
});

describe("verdictAtClose", () => {
  it.each([
    [0, "defeated"],
    [30, "defeated"],
    [31, "got_away"],
    [100, "got_away"],
  ] as const)("%i HP at the close is %s", (left, verdict) => {
    expect(verdictAtClose(left)).toBe(verdict);
  });
});

describe("monsterFor", () => {
  it.each([
    [0, 1, "slime"],
    [1, 1, "slime"],
    [4, 1, "slime"],
    [5, 1, "big_slime"],
    [14, 1, "big_slime"],
    [15, 1, "dragon"],
    [28, 1, "dragon"],
    [3, 2, "hydra"],
    [28, 2, "hydra"],
    [1, 5, "hydra"],
  ] as const)("a Party of %i on %i head(s) is a %s", (size, heads, monster) => {
    expect(monsterFor(size, heads)).toBe(monster);
  });

  it("treats a Bounty with no head count as one head", () => {
    expect(monsterFor(15)).toBe("dragon");
  });
});
