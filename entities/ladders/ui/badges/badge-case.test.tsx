import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BADGES } from "../../lib/badges";
import { facts, hit, times } from "../../lib/badge-fixtures";
import type { BadgeFound } from "../../lib/standing";
import { titleOptions } from "../profile/case-choices";
import { AchievementsView } from "./AchievementsView";
import { BAND_FLOOR, FIRST_WEEK, bandOf, badgeCase, type CaseTile, type FoundTile, type LockedTile } from "./badge-case";
import { GLYPHS, glyphOf, glyphPath } from "./glyphs";

// The Achievements tab (LD.7b; spec "The profile page"; the badges doc,
// sections 4 to 6), built from the owner's own standing, act facts and the
// company's per-badge totals, and drawn as the owner sees it.

const found = (key: string, over: Partial<BadgeFound> = {}): BadgeFound => ({ id: `u-${key}`, key, name: BADGES.find((b) => b.id === key)?.name ?? key, unlockedAt: "2026-10-23T19:00:00Z", shown: true, source: "launch", witnessTable: null, ...over });
const tiles = (c: ReturnType<typeof badgeCase>): CaseTile[] => c.groups.flatMap((g) => g.tiles);
const tile = (c: ReturnType<typeof badgeCase>, id: string) => tiles(c).find((t) => t.id === id);
const noop = { setDisplay: async () => ({ ok: true as const }), markShown: async () => ({ ok: true as const }) };

// The badges doc, section 6: words a locked tile never uses. Badges add; the
// locked tile is a door, not a debt. Checked on every tile the tab can draw.
const FORBIDDEN = ["missing", "not yet earned", "you haven't", "locked because", "don't lose", "hurry", "before", "deadline", "streak", "behind", "others have"];

describe("the badge case", () => {
  it("groups every badge under Learn & Share, Builder or Both ladders, after the first-week set while that is open", () => {
    const c = badgeCase([], [], null, null);
    expect(c.groups.map((g) => g.label)).toEqual(["First week", "Learn & Share", "Builder", "Both ladders"]);
    // Every badge has a tile somewhere, except a family's tiers above its next one.
    for (const b of BADGES) if (!b.family || b.tier === 1) expect(tile(c, b.id)).toBeDefined();
  });

  it("shows the first-week set together at the top for a new person, and folds it into the ladders once all ten are found", () => {
    // The badges doc, section 7: ten easy doors, a label and not a window.
    expect(FIRST_WEEK).toHaveLength(10);
    const fresh = badgeCase([found("first-hit")], [], null, null);
    expect(fresh.groups[0].tiles.map((t) => t.id)).toEqual([...FIRST_WEEK]);
    expect(fresh.groups[0].tiles.map((t) => t.state)).toEqual(["found", ...Array(9).fill("locked")]);
    // Not shown twice: the ladders' groups hold none of them while the set stands.
    for (const g of fresh.groups.slice(1)) for (const t of g.tiles) expect(FIRST_WEEK).not.toContain(t.id);
    const done = badgeCase(FIRST_WEEK.map((id) => found(id)), [], null, null);
    expect(done.groups.map((g) => g.label)).toEqual(["Learn & Share", "Builder", "Both ladders"]);
    expect(tile(done, "first-strike")).toMatchObject({ state: "found" });
    expect(done.groups.find((g) => g.key === "builder")?.tiles.map((t) => t.id)).toContain("first-strike");
  });

  it("shows one locked tile per family, its next tier, and every unfound one-off", () => {
    const c = badgeCase([found("hunter-i")], [], null, null);
    const hunters = tiles(c).filter((t) => t.id.startsWith("hunter-"));
    expect(hunters.map((t) => [t.id, t.state])).toEqual([
      ["hunter-i", "found"],
      ["hunter-ii", "locked"],
    ]);
    // A family nobody started shows its first tier only.
    expect(tiles(c).filter((t) => t.id.startsWith("anvil-")).map((t) => t.id)).toEqual(["anvil-i"]);
    // Every one-off is there, found or with its rule.
    for (const b of BADGES.filter((x) => x.group === "one-off" || (x.group === "crossover" && !x.family))) expect(tile(c, b.id)).toBeDefined();
    // Families never become a wall: at most one locked tile each.
    const families = new Set(BADGES.filter((b) => b.family).map((b) => b.family));
    for (const family of families) expect(tiles(c).filter((t) => t.state === "locked" && BADGES.find((b) => b.id === t.id)?.family === family).length).toBeLessThanOrEqual(1);
  });

  it("says the owner's own count on a family's locked tier, plainly, when their facts were read", () => {
    const c = badgeCase([found("hunter-i")], [], facts({ party: times(7, () => hit()) }), null);
    expect((tile(c, "hunter-ii") as LockedTile).count).toEqual({ have: 7, at: 10 });
    expect((tile(c, "hunter-ii") as LockedTile).rule).toContain("10 Bounty heads");
    // Without the facts, the rule alone; never "You have 0".
    expect((tile(badgeCase([found("hunter-i")], [], null, null), "hunter-ii") as LockedTile).count).toBeNull();
    // A one-off has no count.
    expect((tile(c, "free-sword") as LockedTile).count).toBeNull();
  });

  it("shows a secret badge as its hint alone, and its rule only once found", () => {
    const c = badgeCase([], [], null, null);
    const duel = tile(c, "duel");
    // No rule, and no rarity: either would say something about the secret.
    expect(duel).toEqual({ state: "secret", id: "duel", hint: "Some fights are one on one." });
    expect(JSON.stringify(duel)).not.toMatch(/Turned in|rare/);
    const opened = badgeCase([found("duel")], [], null, null);
    expect(tile(opened, "duel")).toMatchObject({ state: "found", name: "Duel", flavour: expect.stringContaining("slime") });
  });

  it("marks a badge found and not yet seen as new, the replay's included", () => {
    const c = badgeCase([found("lorewright-i", { shown: false, source: "replay" })], [], null, null);
    expect((tile(c, "lorewright-i") as FoundTile).waiting).toBe(true);
  });

  it("keeps only found badges in the display case, in the owner's order", () => {
    expect(badgeCase([found("first-hit"), found("anvil-i")], ["anvil-i", "hydra-slayer", "first-hit"], null, null).displayCase).toEqual(["anvil-i", "first-hit"]);
  });
});

describe("the rarity band", () => {
  it("shows no band below three holders, whatever the share", () => {
    expect(BAND_FLOOR).toBe(3);
    expect(bandOf(0, 16)).toBeNull();
    expect(bandOf(2, 2)).toBeNull();
    expect(bandOf(2, 16)).toBeNull();
  });

  it("is a band, never a percentage: many from half, some from a fifth, a few below", () => {
    expect(bandOf(8, 16)).toBe("Held by many");
    expect(bandOf(4, 16)).toBe("Held by some");
    expect(bandOf(3, 16)).toBe("Held by a few");
    const c = badgeCase([found("first-hit")], [], null, { holders: new Map([["first-hit", 9]]), people: 16 });
    expect((tile(c, "first-hit") as FoundTile).band).toBe("Held by many");
    expect(JSON.stringify(c)).not.toMatch(/\d+ ?%/);
  });
});

describe("the tab as the owner sees it", () => {
  const all = BADGES.map((b) => found(b.id));
  const html = (c: ReturnType<typeof badgeCase>) => renderToStaticMarkup(<AchievementsView model={c} actions={noop} note={null} />);

  it("uses none of the words a badge never says, on any tile it can draw", () => {
    const everyLocked = html(badgeCase([], [], facts(), null)).toLowerCase();
    const everyFound = html(badgeCase(all, [], null, { holders: new Map(all.map((f) => [f.key, 5])), people: 16 })).toLowerCase();
    for (const word of FORBIDDEN) {
      expect(everyLocked).not.toContain(word);
      expect(everyFound).not.toContain(word);
    }
    // No progress bar, no percentage, no nudge.
    for (const nudge of ["almost there", "more to go", "progress", "%"]) expect(everyLocked).not.toContain(nudge);
  });

  it("draws a found tile with its flavour, rarity and switch, a locked tile with its rule, and a secret tile as ???", () => {
    const out = html(badgeCase([found("hunter-i")], [], facts({ party: times(3, () => hit()) }), null));
    expect(out).toContain("Three slimes now flinch at your name.");
    expect(out).toContain('aria-label="Hunter I in my display case"');
    expect(out).toContain("<b>Found by:</b> Turned in on 10 Bounty heads");
    expect(out).toContain("You have 3. This one is found at 10.");
    expect(out).toContain('aria-label="Secret badge">???</h4>');
    expect(out).toContain("Some fights are one on one.");
    // A secret tile carries no rarity word and no rarity class.
    expect(out).not.toMatch(/bd-tile--secret bd--/);
    expect(out.match(/<li class="bd-tile bd-tile--secret">[\s\S]*?<\/li>/)?.[0]).not.toMatch(/bd-r/);
    expect(out).toContain("Only you see the ones still to find");
  });

  it("disables the switch with Display case full at five, except on the five in the case", () => {
    const five = ["first-hit", "spark-struck", "first-page", "anvil-i", "first-strike"];
    const out = html(badgeCase([...five, "weighed"].map((k) => found(k)), five, null, null));
    expect(out).toContain("Display case full");
    expect(out).toMatch(/aria-checked="false" aria-label="Weighed on the scale in my display case" disabled=""/);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(5);
  });

  it("offers a waiting badge the two equal answers instead of the switch", () => {
    const out = html(badgeCase([found("lorewright-i", { shown: false, source: "replay" })], [], null, null));
    expect(out).toContain(">Put in my display case</button>");
    expect(out).toContain(">Keep it in Achievements</button>");
    expect(out).not.toContain('aria-label="Lorewright I in my display case"');
    // Neither is the default: both are drawn alike.
    expect(out.match(/class="bd-act"/g)).toHaveLength(2);
  });

  it("never shows a division, a star or a point", () => {
    const out = html(badgeCase(all, [], facts(), null));
    for (const never of ["★", "division", " points", "Points"]) expect(out).not.toContain(never);
  });
});

describe("titles and glyphs", () => {
  it("offers each found family's Title once, without its numeral", () => {
    const fam = ["hunter-i", "hunter-ii", "hunter-iii"].map((id) => ({ id, name: BADGES.find((b) => b.id === id)!.name, family: "Hunter" }));
    expect(titleOptions(fam)).toEqual([{ value: "hunter-i", label: "Hunter" }]);
    for (const b of BADGES) expect(b.title).not.toMatch(/ (I|II|III|IV)$/);
  });

  it("draws a glyph for every badge", () => {
    for (const b of BADGES) expect(GLYPHS).toContain(glyphOf(b));
    for (const g of GLYPHS) expect(glyphPath(g)).toMatch(/^M/);
  });
});
