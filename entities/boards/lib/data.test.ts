import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { listBoards } from "./data";

// A.52. The boards index counts each board's open and done cards from one tasks
// read. That read used to drop its error, so a failed read drew every board
// with zero open and zero done, which looks like an empty board rather than a
// broken page. A wrong count is a wrong answer, so the read raises.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

beforeEach(() => resetFake());

const board = (id: string) => ({
  id,
  name: id,
  slug: id,
  description: null,
  client_company_id: null,
  ai_program_id: null,
  owner_id: null,
  status: "active",
  sort_order: 0,
  metadata: {},
  archived_at: null,
});

describe("listBoards", () => {
  it("counts open and done cards per board from the tasks read", async () => {
    script("boards", { data: [board("b1")] });
    script("board_members", { data: [] });
    script("tasks", {
      data: [
        { board_id: "b1", status: "open", board_columns: { is_done: false, is_not_doing: false } },
        { board_id: "b1", status: "open", board_columns: { is_done: true, is_not_doing: false } },
      ],
    });
    script("sprints", { data: [] });

    const [b1] = await listBoards();

    expect(b1.open_count).toBe(1);
    expect(b1.done_count).toBe(1);
  });

  it("raises on a failed tasks read rather than answering zero for every board", async () => {
    script("boards", { data: [board("b1")] });
    script("board_members", { data: [] });
    script("tasks", { data: null, error: { message: "connection reset" } });
    script("sprints", { data: [] });

    await expect(listBoards()).rejects.toThrow(/tasks for the index counts: connection reset/);
  });
});
