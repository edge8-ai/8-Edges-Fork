import { describe, expect, it } from "vitest";
import { domainRows, MOVING_DAYS } from "./domain-rows";
import type { EpicRow } from "@/entities/boards/lib/types";

// W.53. The one rule this page cannot get wrong: epics are BOARD-SCOPED, so two
// boards that each call a domain "Marketing" are two rows and are never added
// together. The rest is the re-cut (Khoa, 2026-09-20) — where the open work is,
// and whether it is moving.

const NOW = Date.parse("2026-09-20T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const boards = [
  { id: "b1", name: "8 Edges", slug: "8-edges" },
  { id: "b2", name: "Acme", slug: "acme" },
];

const epic = (id: string, board: string, name: string, over: Partial<EpicRow> = {}): EpicRow => ({
  id,
  board_id: board,
  name,
  description: null,
  color: null,
  status: "active",
  sort_order: 0,
  ...over,
});

const card = (board: string, epicId: string | null, over: Partial<{ status: string; human_tokens: number | null; last_moved_at: string }> = {}) => ({
  board_id: board,
  epic_id: epicId,
  status: "open",
  human_tokens: 1,
  last_moved_at: daysAgo(1),
  ...over,
});

describe("domainRows", () => {
  it("keeps two boards' same-named domains apart, and names the board on each row", () => {
    const model = domainRows(
      boards,
      [epic("e1", "b1", "Marketing"), epic("e2", "b2", "Marketing")],
      [card("b1", "e1", { human_tokens: 5 }), card("b2", "e2", { human_tokens: 2 })],
      NOW,
    );
    expect(model.open).toHaveLength(2);
    expect(model.open.map((r) => [r.boardName, r.epicName, r.openTokens])).toEqual([
      ["8 Edges", "Marketing", 5],
      ["Acme", "Marketing", 2],
    ]);
  });

  it("never counts a card under a domain on another board, even with the same epic id in view", () => {
    // A card on Acme carrying 8 Edges' epic id could only be bad data, and it
    // must not inflate the 8 Edges row.
    const model = domainRows(boards, [epic("e1", "b1", "Ops")], [card("b1", "e1", { human_tokens: 3 }), card("b2", "e1", { human_tokens: 9 })], NOW);
    expect(model.open).toHaveLength(1);
    expect(model.open[0].openTokens).toBe(3);
  });

  it("puts the heaviest open domain first, because that is what the page is for", () => {
    const model = domainRows(
      boards,
      [epic("e1", "b1", "Light"), epic("e2", "b1", "Heavy")],
      [card("b1", "e1", { human_tokens: 1 }), card("b1", "e2", { human_tokens: 8 })],
      NOW,
    );
    expect(model.open.map((r) => r.epicName)).toEqual(["Heavy", "Light"]);
    expect(model.openTokens).toBe(9);
    expect(model.openCards).toBe(2);
  });

  it("ranks an unsized domain by its open cards rather than dropping it to the bottom", () => {
    const model = domainRows(
      boards,
      [epic("e1", "b1", "Sized"), epic("e2", "b1", "Unsized")],
      [
        card("b1", "e1", { human_tokens: null }),
        card("b1", "e2", { human_tokens: null }),
        card("b1", "e2", { human_tokens: null }),
      ],
      NOW,
    );
    expect(model.open.map((r) => r.epicName)).toEqual(["Unsized", "Sized"]);
  });

  it("says how many cards moved this week, and how long a still domain has been still", () => {
    const model = domainRows(
      boards,
      [epic("e1", "b1", "Moving"), epic("e2", "b1", "Still")],
      [
        card("b1", "e1", { last_moved_at: daysAgo(2) }),
        card("b1", "e2", { last_moved_at: daysAgo(30) }),
        card("b1", "e2", { last_moved_at: daysAgo(40) }),
      ],
      NOW,
    );
    const moving = model.open.find((r) => r.epicName === "Moving");
    const still = model.open.find((r) => r.epicName === "Still");
    expect(moving?.movedRecently).toBe(1);
    expect(still?.movedRecently).toBe(0);
    // The FRESHEST open card, so a domain is not called stale by its oldest one.
    expect(still?.stillForDays).toBe(30);
    expect(still!.stillForDays!).toBeGreaterThanOrEqual(MOVING_DAYS);
  });

  it("folds a domain with nothing open away from the domains that need attention", () => {
    const model = domainRows(boards, [epic("e1", "b1", "Shipped")], [card("b1", "e1", { status: "done" })], NOW);
    expect(model.open).toEqual([]);
    expect(model.quiet.map((r) => r.epicName)).toEqual(["Shipped"]);
    expect(model.quiet[0].stillForDays).toBeNull();
  });

  it("leaves out archived domains and domains whose board is not in this scope", () => {
    const model = domainRows(
      [boards[0]],
      [epic("e1", "b1", "Gone", { status: "archived" }), epic("e2", "b2", "Elsewhere")],
      [card("b1", "e1"), card("b2", "e2")],
      NOW,
    );
    expect(model.open).toEqual([]);
    expect(model.quiet).toEqual([]);
  });

  it("does not count cards filed under no domain at all", () => {
    const model = domainRows(boards, [epic("e1", "b1", "Ops")], [card("b1", null, { human_tokens: 9 }), card("b1", "e1", { human_tokens: 1 })], NOW);
    expect(model.openTokens).toBe(1);
  });
});
