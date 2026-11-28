import { beforeEach, describe, expect, it, vi } from "vitest";

// Which board the content calendar syncs to: the active board whose metadata
// marks it as the content board, with its epic and its columns by role.

const activeBoardsWithMetadata = vi.hoisted(() => vi.fn());
vi.mock("@/entities/boards", () => ({
  activeBoardsWithMetadata,
  columnsOfBoard: async () => ({
    data: [
      { id: "col-todo", name: "To do", position: 0, is_done: false, is_not_doing: false },
      { id: "col-doing", name: "Doing", position: 1, is_done: false, is_not_doing: false },
      { id: "col-done", name: "Done", position: 2, is_done: true, is_not_doing: false },
      { id: "col-nd", name: "Not Doing", position: 3, is_done: false, is_not_doing: true },
    ],
    error: null,
  }),
  boardOwner: async () => ({ data: [{ person_id: "thao" }], error: null }),
}));

const { loadContentBoard } = await import("./board");

const board = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  slug: "revenue",
  metadata: { content_board: true, content_epic_id: "epic-1" },
  ...over,
});

beforeEach(() => activeBoardsWithMetadata.mockReset());

describe("the content board", () => {
  it("is the active board marked as the content board, with its epic and its columns by role", async () => {
    activeBoardsWithMetadata.mockResolvedValue({ data: [board({ id: "other", metadata: {} }), board()], error: null });
    const r = await loadContentBoard();
    expect(r).toEqual({
      ok: true,
      board: {
        id: "b1",
        slug: "revenue",
        ownerId: "thao",
        epicId: "epic-1",
        columns: { todo: "col-todo", doing: "col-doing", waiting: "col-doing", done: "col-done", notDoing: "col-nd" },
      },
    });
  });

  it("is none when no board is marked", async () => {
    activeBoardsWithMetadata.mockResolvedValue({ data: [board({ metadata: {} })], error: null });
    expect(await loadContentBoard()).toEqual({ ok: true, board: null });
  });
});
