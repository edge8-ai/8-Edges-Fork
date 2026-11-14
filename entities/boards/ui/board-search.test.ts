import { describe, expect, it } from "vitest";
import { cardMatchesSearch, foldForSearch } from "./board-search";

// What the board search promises: it finds a card by part of its title, its
// description, its assignee or its short code; more words narrow rather than
// widen; and a Vietnamese name is reachable from a keyboard that cannot type
// its accents, which is the case the whole fold exists for.

const card = (over: Partial<Parameters<typeof cardMatchesSearch>[0]> = {}) => ({
  id: "030b0f26-1111-2222-3333-444455556666",
  title: "Fix the login bug",
  description: "The magic link expires too early for Đỗ Trang.",
  assignee_name: "Dana Pham",
  ...over,
});

describe("foldForSearch", () => {
  it("strips Vietnamese accents and the đ that does not decompose", () => {
    expect(foldForSearch("Đỗ Trang")).toBe("do trang");
    expect(foldForSearch("Nguyễn Thị Mai")).toBe("nguyen thi mai");
  });

  it("lowercases and collapses whitespace", () => {
    expect(foldForSearch("  Fix   THE  Login \n bug ")).toBe("fix the login bug");
  });

  it("keeps punctuation, unlike a slug fold", () => {
    expect(foldForSearch("expires, too early.")).toBe("expires, too early.");
  });
});

describe("cardMatchesSearch", () => {
  it("matches nothing-typed with everything", () => {
    expect(cardMatchesSearch(card(), "")).toBe(true);
    expect(cardMatchesSearch(card(), "   ")).toBe(true);
  });

  it("matches part of the title, case-insensitively", () => {
    expect(cardMatchesSearch(card(), "LOGIN")).toBe(true);
    expect(cardMatchesSearch(card(), "logout")).toBe(false);
  });

  it("matches the description and the assignee", () => {
    expect(cardMatchesSearch(card(), "magic link")).toBe(true);
    expect(cardMatchesSearch(card(), "dana")).toBe(true);
  });

  it("finds an accented name typed without accents, and vice versa", () => {
    expect(cardMatchesSearch(card(), "do trang")).toBe(true);
    expect(cardMatchesSearch(card(), "Đỗ Trang")).toBe(true);
  });

  it("matches the card's short code, so a pasted link finds its card", () => {
    expect(cardMatchesSearch(card(), "030b0f26")).toBe(true);
    expect(cardMatchesSearch(card(), "deadbeef")).toBe(false);
  });

  it("narrows on every term rather than widening on any", () => {
    expect(cardMatchesSearch(card(), "login bug")).toBe(true);
    // "dana" is the assignee and "login" the title: both must hold, and do.
    expect(cardMatchesSearch(card(), "login dana")).toBe(true);
    // One term that cannot match makes the whole query fail.
    expect(cardMatchesSearch(card(), "login pineapple")).toBe(false);
  });

  it("survives a card with no description and no assignee", () => {
    const bare = card({ description: null, assignee_name: null });
    expect(cardMatchesSearch(bare, "login")).toBe(true);
    expect(cardMatchesSearch(bare, "dana")).toBe(false);
  });
});
