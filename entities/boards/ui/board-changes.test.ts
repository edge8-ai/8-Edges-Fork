import { describe, expect, it } from "vitest";
import { cardsMovedSince, sinceLabel } from "./board-changes";

const card = (id: string, moved: string | null) => ({ id, last_column_move_at: moved });

describe("cardsMovedSince (W.63)", () => {
  it("a first-ever visit shows nothing rather than everything", () => {
    expect(cardsMovedSince([card("a", "2026-09-19T10:00:00Z"), card("b", "2026-09-20T10:00:00Z")], null)).toEqual([]);
  });

  it("names the cards that moved after the last visit, and only those", () => {
    const cards = [
      card("before", "2026-09-18T09:00:00Z"),
      card("after", "2026-09-20T09:00:00Z"),
      card("never", null),
    ];
    expect(cardsMovedSince(cards, "2026-09-19T00:00:00Z")).toEqual(["after"]);
  });

  it("a card that has never moved is never 'changed', however old the visit", () => {
    // last_moved_at falls back to created_at for the aging clock; this
    // question must not, or every card older than the visit would read as news.
    expect(cardsMovedSince([card("never", null)], "2000-01-01T00:00:00Z")).toEqual([]);
  });

  it("a move exactly at the last visit is not news", () => {
    expect(cardsMovedSince([card("a", "2026-09-19T00:00:00Z")], "2026-09-19T00:00:00Z")).toEqual([]);
  });

  it("answers with card ids and nothing else — no person can reach the result", () => {
    // The house rule for this feature: WHICH cards moved, never who moved
    // them. task_stage_log records moved_by and the row type here has no slot
    // for it, so a caller cannot slice this answer by person.
    const result = cardsMovedSince([card("a", "2026-09-20T09:00:00Z")], "2026-09-19T00:00:00Z");
    expect(result.every((v) => typeof v === "string")).toBe(true);
  });
});

describe("sinceLabel", () => {
  const now = new Date(2026, 8, 21, 10, 0); // Monday 21 Sept 2026, local

  it("reads as a weekday inside the last week", () => {
    expect(sinceLabel(new Date(2026, 8, 18, 9, 0).toISOString(), now)).toBe("Friday");
  });

  it("says yesterday and earlier today rather than naming the day", () => {
    expect(sinceLabel(new Date(2026, 8, 20, 9, 0).toISOString(), now)).toBe("yesterday");
    expect(sinceLabel(new Date(2026, 8, 21, 8, 0).toISOString(), now)).toBe("earlier today");
  });

  it("falls back to a date once a weekday name would be ambiguous", () => {
    expect(sinceLabel(new Date(2026, 8, 1, 9, 0).toISOString(), now)).toBe("1 Sept");
  });

  it("survives a stored value that is not a timestamp", () => {
    expect(sinceLabel("not a date", now)).toBe("your last visit");
  });
});
