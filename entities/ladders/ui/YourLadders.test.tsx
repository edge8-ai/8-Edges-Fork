import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Tier } from "../lib/points";
import type { PositionRow, UnlockRow } from "../lib/rows";
import { myStanding, shapeStanding } from "../lib/standing";
import { display, memoryStore, type MemoryStore } from "../lib/testing";
import { placeBeneath, placeWords } from "../lib/place-words";
import { YourLaddersView } from "./YourLadders";

// The Your ladders panel (LD.2), serialised as the server draws it on the
// profile's Overview tab (LD.6). It is drawn from the reader's own standing:
// with a teammate's rows in the same tables, none of their points reach the
// markup. In the game style each tier is its emblem with the division or stars
// beneath; with the game style off it speaks plainly, draws no art, and still
// shows every tier, point and bar. Its Show switches moved onto the profile's
// plaque with LD.6, so the panel carries none. Who may see the panel at all is
// the profile page's to decide (./profile/ProfilePages.test.tsx).

const ME = "person-me";
const MATE = "person-mate";

let store: MemoryStore = memoryStore();

const ls = (person_id: string, points: number, tier: Tier, division: 1 | 2 | 3 | 4): PositionRow => ({
  person_id, ladder: "learn_share", points, tier, division, stars: null, immortal_band: null, counts: { hits: 40, sparks: 5, fires: 0, beacons: 0 }, computed_at: "2026-10-21T19:00:00Z",
});
const b = (person_id: string, points: number, tier: Tier, stars: 1 | 2 | 3 | 4 | 5): PositionRow => ({
  person_id, ladder: "builder", points, tier, division: null, stars, immortal_band: null, counts: { cards: 41, humanTokens: 920.05 }, computed_at: "2026-10-21T19:00:00Z",
});
const unlock = (person_id: string, ladder: "learn_share" | "builder", key: string): UnlockRow => ({
  id: `${person_id}-${key}`, person_id, kind: "tier", ladder, key, unlocked_at: "2026-10-21T19:00:00Z", source: "replay", shown_at: "2026-10-21T19:00:00Z",
});

beforeEach(() => {
  store = memoryStore({
    positions: [ls(ME, 450, "gold", 2), b(ME, 9_200.5, "legend", 3), ls(MATE, 7_777, "challenger", 1), b(MATE, 31_313, "divine", 1)],
    unlocks: [unlock(ME, "learn_share", "gold"), unlock(ME, "builder", "legend"), unlock(MATE, "learn_share", "challenger")],
    display: [display({ person_id: ME }), display({ person_id: MATE, game_style: false })],
  });
});

describe("YourLaddersView", () => {
  it("draws the reader's own ladders, marked Only you, and nothing of a teammate's", async () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={await myStanding({ personId: ME }, store)} />);
    expect(html).toContain("Your ladders");
    expect(html).toContain("Only you");
    expect(html).toContain("Your tier only ever goes up. Nothing resets.");
    expect(html).toContain("<strong>450</strong> points");
    expect(html).toContain("<strong>9,200</strong> points");
    expect(html).toContain("150 to Platinum, which starts at 600");
    for (const theirs of ["7,777", "31,313", 'aria-label="Challenger', 'aria-label="Divine']) expect(html).not.toContain(theirs);
  });

  it("draws the Gold helm and the Legend medal in place of the tier words, the division and the stars beneath", async () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={await myStanding({ personId: ME }, store)} />);
    expect(html).toContain('role="img" aria-label="Gold II"');
    expect(html).toMatch(/<img src="[^"]*helm-gold[^"]*"/);
    expect(html).toContain('role="img" aria-label="Legend ★★★"');
    expect(html).toMatch(/<img src="[^"]*medal-legend[^"]*"/);
    // The medal carries its owner's star arc.
    expect(html).toContain('class="ladder-emblem-stars"');
    expect(html).toContain('<span class="yl-beneath" aria-hidden="true">II</span>');
    expect(html).toContain('<span class="yl-beneath" aria-hidden="true">★★★</span>');
    expect(html).not.toContain('class="yl-tier"');
  });

  it("draws the teammate's own, and only theirs, when they are the reader, plainly as they chose", async () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={await myStanding({ personId: MATE }, store)} />);
    expect(html).toContain("7,777");
    expect(html).toContain('<p class="yl-tier">Challenger, division III');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("9,200");
  });

  it("with the game style off speaks plainly, draws no art, and still shows the tiers, points and bars", () => {
    const standing = shapeStanding({ personId: ME }, { positions: store.positions, unlocks: store.unlocks, display: [display({ person_id: ME, game_style: false })] });
    const html = renderToStaticMarkup(<YourLaddersView standing={standing} />);
    expect(html).toContain("Gold, division II");
    expect(html).toContain("Legend, 3 of 5 stars");
    expect(html).toContain("40 answers · 5 sparks · 0 sessions held · 0 shared outside");
    for (const game of ["hits", "fires hosted", "beacons lit"]) expect(html).not.toContain(game);
    expect(html).not.toContain("★");
    expect(html).not.toContain("<img");
    expect(html).toContain("<strong>450</strong> points");
    expect(html).toContain('<progress class="yl-bar" max="100" value="50"');
  });

  it("carries no Show switch: the switches live on the profile's plaque now", () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={shapeStanding({ personId: ME }, { positions: store.positions, unlocks: store.unlocks, display: [] })} />);
    expect(html).not.toContain('role="switch"');
  });

  it("names the place in each style, and what sits beneath the emblem", () => {
    const standing = shapeStanding({ personId: ME }, { positions: store.positions, unlocks: store.unlocks, display: [] });
    expect(placeWords(standing.learnShare, true)).toBe("Gold II");
    expect(placeWords(standing.learnShare, false)).toBe("Gold, division II");
    expect(placeWords(standing.builder, true)).toBe("Legend ★★★");
    expect(placeBeneath(standing.learnShare)).toBe("II");
    expect(placeBeneath(standing.builder)).toBe("★★★");
  });
});
