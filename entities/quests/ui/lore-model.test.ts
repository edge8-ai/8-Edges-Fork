import { describe, expect, it } from "vitest";
import { loreWords, sharedLine, willTryLine } from "./lore-model";

// The Lore's words in each game style (QS.4; Khoa, 2026-10-21): on, the
// glossary's game words and the drop; off, plain words, no art, and "Spark
// struck" never shown. The points are the ladders', handed in through the page
// slot (QS.13); with none (no ladders) no number shows.
describe("the Lore's words", () => {
  it("is the Lore with its glyph in the game style, and Learnings without it in the plain one", () => {
    expect(loreWords(true, 10)).toMatchObject({ title: "The Lore", share: "Share · +10", glyph: true });
    expect(loreWords(false, 10)).toMatchObject({ title: "Learnings", share: "Share · +10 points", glyph: false });
  });

  it("says the points the slot hands over, and none without it", () => {
    expect(loreWords(true, 15).share).toBe("Share · +15");
    expect(loreWords(true, null).share).toBe("Share");
    expect(loreWords(false, null).share).toBe("Share");
  });

  it("drops the points in the game style and says them plainly otherwise, naming no badge itself", () => {
    // A badge a learning finds (Spark struck) drops from the ladders' own drop (LD.7b); Quests never names one.
    expect(sharedLine(true, 10)).toEqual({ drop: true, text: "+10" });
    expect(sharedLine(false, 10)).toEqual({ drop: false, text: "Shared · +10 points" });
    expect(sharedLine(true, 10).text).not.toContain("Spark struck");
  });

  it("is a quiet line with no points and no badge when there are no ladders", () => {
    expect(sharedLine(true, null)).toEqual({ drop: false, text: "Shared." });
    expect(sharedLine(false, null)).toEqual({ drop: false, text: "Shared." });
  });

  it("says how many will try, and nothing else", () => {
    expect(willTryLine(0)).toBe("0 will try");
    expect(willTryLine(3)).toBe("3 will try");
  });
});
