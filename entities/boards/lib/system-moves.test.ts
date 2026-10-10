import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A card moved by a routine (landCardAsSystem): the same landing as a drag,
// with the routine as the actor and no person. Scripted in the order it asks:
// the card, then the column it is to land in. landCard itself is faked, so
// what is pinned here is what this door decides before handing over: when
// there is nothing to do, when it must refuse, and who it says moved the card.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const landCard = vi.fn(async (_landing: unknown) => ({ ok: true as const }));
vi.mock("./land-card", () => ({ landCard: (landing: unknown) => landCard(landing) }));

const { landCardAsSystem } = await import("./system-moves");

const card = (over: Record<string, unknown> = {}) => ({
  id: "card-1",
  board_id: "board-1",
  board_column_id: "col-todo",
  subject_type: "marketing_day",
  subject_id: null,
  boards: { slug: "revenue" },
  ...over,
});
const move = (toColumnId = "col-done") => landCardAsSystem({ taskId: "card-1", toColumnId, label: "content sync" });

beforeEach(() => {
  resetFake();
  landCard.mockClear();
});

describe("a card moved by a routine", () => {
  it("does nothing when the card is already in that column, whoever put it there", async () => {
    script("tasks", { data: card({ board_column_id: "col-done" }) });
    expect(await move("col-done")).toEqual({ ok: true });
    expect(landCard).not.toHaveBeenCalled();
    expect(calls.some((c) => c.table === "board_columns")).toBe(false);
  });

  it("refuses a column that is not on the card's board", async () => {
    script("tasks", { data: card() });
    script("board_columns", { data: null });
    expect(await move("col-elsewhere")).toEqual({ ok: false, error: "That column is not on the card's board." });
    expect(landCard).not.toHaveBeenCalled();
    const column = calls.find((c) => c.table === "board_columns");
    expect(column?.filters).toContainEqual(["eq", "id", "col-elsewhere"]);
    expect(column?.filters).toContainEqual(["eq", "board_id", "board-1"]);
  });

  it("says so when the card no longer exists", async () => {
    script("tasks", { data: null });
    expect(await move()).toEqual({ ok: false, error: "That card no longer exists." });
    expect(landCard).not.toHaveBeenCalled();
  });

  it("fails rather than guessing when the card cannot be read", async () => {
    script("tasks", { error: { message: "tasks unavailable" } });
    expect(await move()).toEqual({ ok: false, error: "tasks unavailable" });
    expect(landCard).not.toHaveBeenCalled();
  });

  it("lands the card as the routine, with no person, the same way a drag would", async () => {
    script("tasks", { data: card({ subject_type: "marketing_campaign", subject_id: "camp-1" }) });
    script("board_columns", { data: { id: "col-done", is_done: true, is_not_doing: false } });
    expect(await move("col-done")).toEqual({ ok: true });
    expect(landCard).toHaveBeenCalledTimes(1);
    expect(landCard).toHaveBeenCalledWith({
      taskId: "card-1",
      actor: { label: "content sync", personId: null, isAdmin: true },
      from: { boardId: "board-1", columnId: "col-todo" },
      to: { boardId: "board-1", boardSlug: "revenue", columnId: "col-done", isDone: true, isNotDoing: false },
      subject: { type: "marketing_campaign", id: "camp-1" },
      logNote: "Moved by content sync",
      refreshSlugs: ["revenue"],
    });
  });
});
