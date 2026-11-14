import { describe, expect, it } from "vitest";
import type { LearnShareAct } from "../slots";
import { ACT_BADGES } from "./act-badges";
import { BADGES, badgeById } from "./badges";
import { beacon, facts, hit, hosted, spark, times } from "./badge-fixtures";
import type { PersonActFacts } from "./act-facts";

// The act-to-badge list the Lands for you rail reads (QS.15) is data, and the
// rules in badges.ts are the truth: this checks the one against the other, so
// a rule that changes cannot leave the rail promising a badge the act would
// not find, or counting toward one it does not move.

/** The person's facts after n of one act, as the page's act would add them. */
const after: Record<LearnShareAct, (n: number) => PersonActFacts> = {
  hit: (n) => facts({ party: times(n, () => hit()) }),
  learning: (n) => facts({ sparks: times(n, () => spark()) }),
  fire: (n) => facts({ hosted: times(n, () => hosted()) }),
  beacon: (n) => facts({ party: times(n, () => beacon()) }),
};
const ACTS = Object.keys(ACT_BADGES) as LearnShareAct[];
const family = (name: string) => BADGES.filter((b) => b.family === name);

describe("ACT_BADGES", () => {
  it.each(ACTS)("names only badges the catalogue holds, none of them secret (%s)", (act) => {
    for (const entry of ACT_BADGES[act].badges) {
      const badges = "oneOff" in entry ? [badgeById(entry.oneOff)] : family(entry.family);
      expect(badges.length).toBeGreaterThan(0);
      for (const b of badges) {
        expect(b).toBeDefined();
        expect(b?.secret).toBe(false);
      }
    }
  });

  it.each(ACTS)("lists one-offs that one act finds outright, and nothing finds before it (%s)", (act) => {
    for (const entry of ACT_BADGES[act].badges) {
      if (!("oneOff" in entry)) continue;
      const b = badgeById(entry.oneOff);
      expect(b?.find(after[act](0))).toBeNull();
      expect(b?.find(after[act](1))).not.toBeNull();
    }
  });

  it.each(ACTS)("lists families whose count moves by one with each act (%s)", (act) => {
    for (const entry of ACT_BADGES[act].badges) {
      if ("oneOff" in entry) continue;
      for (const b of family(entry.family)) {
        if (!b.count) continue;
        // Scribe moves with a hit on a learning Bounty, the one kind of hit it counts.
        const n = (k: number) => (entry.family === "Scribe" ? facts({ party: times(k, () => hit({ learning: true })) }) : after[act](k));
        expect([0, 1, 3].map((k) => b.count?.of(n(k)))).toEqual([0, 1, 3]);
      }
    }
  });

  it("leaves without a count the families an act of the same kind does not always move", () => {
    // Lorewright counts learning sparks; the standing's sparks count a build spark too.
    expect(ACT_BADGES.learning.badges).toContainEqual({ family: "Lorewright", count: null });
    expect(badgeById("lorewright-i")?.count?.of(facts({ sparks: [spark({ kind: "build" })] }))).toBe(0);
    // Scribe counts hits on a learning Bounty; the standing's hits count every Bounty.
    expect(ACT_BADGES.hit.badges).toContainEqual({ family: "Scribe", count: null });
    expect(badgeById("scribe-i")?.count?.of(facts({ party: [hit()] }))).toBe(0);
  });

  it.each(ACTS)("names only badges and families the catalogue holds, none secret (%s)", (act) => {
    for (const entry of ACT_BADGES[act].badges) {
      const named = "oneOff" in entry ? BADGES.filter((b) => b.id === entry.oneOff) : BADGES.filter((b) => b.family === entry.family);
      expect(named.length).toBeGreaterThan(0);
      for (const b of named) expect(b.secret).toBe(false);
    }
  });
});
