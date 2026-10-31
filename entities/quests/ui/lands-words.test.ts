import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ActDrop } from "./ActDrop";
import { dropWords, landsRailWords, progressWords } from "./lands-words";
import { READER_LANDS, READER_PLACE, lands, place } from "./lands-fixtures";

// The words of Lands for you and of the drop where an act lands (QS.15),
// game and plain, and the Avoid lists of both glossaries: a place is a tier
// and its division, a rarity is a word, a count is the reader's own, and
// nothing urges.

const AVOID = /\brank\b(?!-up)|\blevel\b|almost there|only \d+ more|\bbehind\b|\bframe\b|%|held by/i;

describe("landsRailWords", () => {
  it("says the points, the tier before and after, how far is left, the badge and the Title held", () => {
    const w = landsRailWords(READER_PLACE, READER_LANDS.fire, true);
    expect(w).toMatchObject({ label: "Lands for you", only: "only you see this", points: "+100", before: "Gold III", after: "Gold II", moves: true, note: "25 to Gold I", newTier: false });
    expect(w.badges).toEqual([{ name: "Fire keeper II", rarity: "rare", progress: "1 of 5" }]);
    expect(w.title).toEqual({ lead: "Title to wear:", name: "Fire keeper", held: "· you have it" });
  });

  it("says a new tier when the act crosses one, plainly with the game style off", () => {
    expect(landsRailWords(READER_PLACE, READER_LANDS.beacon, true)).toMatchObject({ after: "Platinum IV", note: "new tier · the rank-up fills the screen", newTier: true });
    expect(landsRailWords(READER_PLACE, READER_LANDS.beacon, false)).toMatchObject({ before: "Gold, division III", after: "Platinum, division IV", note: "a new tier" });
    expect(landsRailWords(READER_PLACE, READER_LANDS.fire, false).note).toBe("25 to Gold, division I");
  });

  it("says the place once when the act does not move the reader, with how far is left", () => {
    expect(landsRailWords(READER_PLACE, READER_LANDS.learning, true)).toMatchObject({ before: "Gold III", after: "Gold III", moves: false, note: "40 to Gold II" });
  });

  it("names no badge and no Title when the ladders hand none over", () => {
    const w = landsRailWords(READER_PLACE, { ...READER_LANDS.fire, badges: [], title: null }, true);
    expect(w.badges).toEqual([]);
    expect(w.title).toBeNull();
    expect(w.points).toBe("+100");
  });

  it("keeps clear of both glossaries' Avoid lists", () => {
    for (const l of Object.values(READER_LANDS)) for (const game of [true, false]) expect(JSON.stringify(landsRailWords(READER_PLACE, l, game))).not.toMatch(AVOID);
  });
});

describe("progressWords", () => {
  it("says the reader's own count, finds it for a one-off, or nothing without an exact count, and never urges", () => {
    expect(progressWords({ have: 1, at: 5 })).toBe("1 of 5");
    expect(progressWords({ have: 4, at: 5 })).toBe("4 of 5");
    expect(progressWords({ have: 0, at: 1 })).toBe("finds it");
    expect(progressWords(null)).toBeNull();
  });
});

describe("dropWords and the drop", () => {
  it("drops the points, and the new tier when the act crossed one", () => {
    expect(dropWords(READER_LANDS.learning, true)).toEqual({ points: "+10", tier: null });
    expect(dropWords(READER_LANDS.beacon, true)).toEqual({ points: "+250", tier: "New tier: Platinum" });
    expect(dropWords(READER_LANDS.beacon, false)).toEqual({ points: "+250 points", tier: "New tier: Platinum" });
  });

  it("says a fire's points land when someone sits down, and claims no tier for them yet", () => {
    const crossing = lands({ points: 100, after: place("Platinum", 4), newTier: true });
    expect(dropWords(crossing, true, "when someone sits down")).toEqual({ points: "+100 when someone sits down", tier: null });
  });

  it("drops nothing without the ladders", () => {
    expect(dropWords(null, true)).toBeNull();
  });

  it("draws the points in the game style and a quiet line plainly, naming no badge itself", () => {
    const drop = { key: 1, points: "+10", tier: "New tier: Gold" };
    const game = renderToStaticMarkup(createElement(ActDrop, { drop, game: true, glyph: "page" }));
    expect(game).toContain('class="qn-drop ');
    expect(game).toMatch(/New tier: Gold · <em>\+10<\/em>/);
    const plain = renderToStaticMarkup(createElement(ActDrop, { drop, game: false, glyph: "page" }));
    expect(plain).toContain("qn-shared");
    expect(plain).toContain("New tier: Gold · +10");
    expect(plain).not.toContain("<svg");
    expect(renderToStaticMarkup(createElement(ActDrop, { drop: null, game: true, glyph: "page" }))).toBe("");
  });
});
