import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { Tier } from "../lib/points";
import type { PositionRow, UnlockRow } from "../lib/rows";
import { myStanding, shapeStanding } from "../lib/standing";
import { display, memoryStore, type MemoryStore } from "../lib/testing";
import { placeWords } from "../lib/place-words";
import { YourLaddersView } from "./YourLadders";

// The Your ladders panel (LD.2), serialised as the server draws it on the
// profile's Overview tab. Since LD.10 it says where the points come from: each
// ladder's acts counted, and what earns points. It is drawn from the reader's
// own standing: with a teammate's rows in the same tables, none of their
// points reach the markup. The tiers, the bars and the Show switches are the
// rank cards' (./profile/Customise.test.tsx). Who may see the panel at all is
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
  it("counts the reader's own acts, marked Only you, and nothing of a teammate's", async () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={await myStanding({ personId: ME }, store)} />);
    expect(html).toContain("Where your points come from");
    expect(html).toContain("Only you");
    expect(html).toContain("<strong>450</strong> points");
    expect(html).toContain("<strong>9,200</strong> points");
    expect(html).toContain("<b>41</b><span>cards shipped</span>");
    expect(html).toContain("<b>920.05</b><span>Human Tokens</span>");
    expect(html).toContain("<b>40</b><span>hits</span>");
    expect(html).toContain("What earns points, and where each tier starts");
    for (const theirs of ["7,777", "31,313"]) expect(html).not.toContain(theirs);
  });

  it("draws the teammate's own, and only theirs, when they are the reader", async () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={await myStanding({ personId: MATE }, store)} />);
    expect(html).toContain("7,777");
    expect(html).not.toContain("9,200");
  });

  it("draws no tier art, no bar and no Show switch: those are the rank cards'", () => {
    const html = renderToStaticMarkup(<YourLaddersView standing={shapeStanding({ personId: ME }, { positions: store.positions, unlocks: store.unlocks, display: [] })} />);
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("<progress");
    expect(html).not.toContain("<img");
  });

  it("names the place in each style", () => {
    const standing = shapeStanding({ personId: ME }, { positions: store.positions, unlocks: store.unlocks, display: [] });
    expect(placeWords(standing.learnShare, true)).toBe("Gold II");
    expect(placeWords(standing.learnShare, false)).toBe("Gold, division II");
    expect(placeWords(standing.builder, true)).toBe("Legend ★★★");
  });
});
