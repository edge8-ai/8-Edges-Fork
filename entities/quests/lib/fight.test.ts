import { describe, expect, it } from "vitest";
import { monsterFor } from "./fight";

// The monster a Bounty draws, by its heads and the size of the Party it called.

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
