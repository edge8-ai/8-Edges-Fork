import { describe, expect, it } from "vitest";
import { answeredShare, answersLine, kindLine, plainTally, plantFed, plantLine } from "./plain-model";
import type { HeadCard } from "../lib/quests-read";

// The plain view's arithmetic and words (QS.11), as a table. The plant grows
// with the share of the people asked who answered, blooms when all have, and
// never wilts; nothing here counts the people who have not answered.

const head = (hp: number, verdict: HeadCard["verdict"] = null) => ({ hp, verdict });

describe("answeredShare", () => {
  it.each([
    [100, 0],
    [61, 39],
    [0, 100],
    [130, 0],
    [-5, 100],
  ])("HP %i is %i%% answered", (hp, share) => {
    expect(answeredShare(hp)).toBe(share);
  });
});

describe("plantFed", () => {
  it.each([
    [100, 0],
    [96, 0],
    [94, 1],
    [61, 4],
    [50, 5],
    [20, 8],
    [10, 9],
    [6, 9],
    [4, 10],
    [0, 10],
  ])("HP %i feeds the plant %i", (hp, fed) => {
    expect(plantFed(hp)).toBe(fed);
  });
});

describe("plantLine", () => {
  it.each([
    ["open", head(100), "A seed, waiting"],
    ["open", head(90), "Sprouted"],
    ["open", head(61), "Growing"],
    ["open", head(20), "Leafy"],
    ["open", head(10), "Budding"],
    ["open", head(0), "In full bloom"],
    ["closed", head(15, "defeated"), "It bloomed"],
    ["closed", head(58, "got_away"), "It grew this far"],
    ["withdrawn", head(100), "Withdrawn"],
  ] as const)("%s at %o says %s", (state, h, line) => {
    expect(plantLine(state, h)).toBe(line);
  });

  it("never says the plant wilted, died or was lost", () => {
    const lines = [0, 30, 60, 100].flatMap((hp) => [plantLine("open", head(hp)), plantLine("closed", head(hp, "got_away")), plantLine("closed", head(hp, "defeated"))]);
    expect(lines.join(" ")).not.toMatch(/wilt|die|dead|lost|fail|miss/i);
  });
});

describe("kindLine", () => {
  it.each([
    [{ kind: "bounty", heads: [1], required: false }, "Bounty"],
    [{ kind: "bounty", heads: [1], required: true }, "Bounty · required"],
    [{ kind: "bounty", heads: [1, 2, 3], required: false }, "Bounty · 3 parts"],
    [{ kind: "raid", heads: [1, 2], required: false }, "Raid"],
    [{ kind: "beacon", heads: [], required: false }, "Beacon"],
  ] as const)("%o is %s", (card, line) => {
    expect(kindLine(card as never)).toBe(line);
  });
});

describe("answersLine", () => {
  it.each([
    [0, 1, "0 answers"],
    [1, 1, "1 answer"],
    [9, 1, "9 answers"],
    [9, 3, "9 answers across 3 parts"],
    [1, 2, "1 answer across 2 parts"],
  ] as const)("%i answers on %i part(s) is %s", (n, parts, line) => {
    expect(answersLine(n, parts)).toBe(line);
  });
});

describe("plainTally", () => {
  it("says the company's numbers in plain words, with no game word", () => {
    const tally = plainTally({ name: "Autumn", hits: 1, campfires: 2, beacons: 0, discoveries: 6 });
    expect(tally.map((t) => `${t.n} ${t.words}`)).toEqual(["1 answer", "2 sessions held", "0 shared outside", "6 learnings"]);
    expect(tally.map((t) => t.words).join(" ")).not.toMatch(/hit|campfire|lore|landed/i);
  });
});
