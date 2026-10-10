import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.171: Give it a day, the one write My Week makes. The board gate is the real
// one (mutation.ts over the fake client); what this proves is the narrower rule
// on top of it — the reader's own open card, a real date, one field written —
// and that a refusal says why instead of reading as success.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "Member", personId: "me", isAdmin: false })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
// Start hands the landing to the board's own landCard, which has its own suite;
// here it is a spy, so what is proven is where Start sends the card.
vi.mock("@/entities/boards/lib/land-card", () => ({ landCard: vi.fn(async () => ({ ok: true })) }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const updates = () => calls.filter((c) => c.table === "tasks" && c.ops.includes("update"));

describe("giveDay", () => {
  it("writes the due date, and only the due date, on the reader's own open card", async () => {
    script("tasks", { data: { board_id: "b1", assignee_id: "me", status: "open" } }, { data: null });
    const { giveDay } = await import("./my-week-actions");
    const { recordAudit } = await import("@/kernel/audit/audit");

    expect(await giveDay(null, form({ taskId: "t1", due: "2026-10-08" }))).toEqual({ ok: true });
    expect(updates()[0]?.payloads[0]).toEqual({ due_date: "2026-10-08" });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "tasks", recordId: "t1", operation: "update", actor: "Member" }));
  });

  it("refuses a card assigned to somebody else, even to a member of its board", async () => {
    script("tasks", { data: { board_id: "b1", assignee_id: "someone-else", status: "open" } });
    const { giveDay } = await import("./my-week-actions");
    expect(await giveDay(null, form({ taskId: "t1", due: "2026-10-08" }))).toEqual({ ok: false, error: "Only the person a card is assigned to can give it a day from My Week." });
    expect(updates()).toEqual([]);
  });

  it("refuses a date that names no day, before it writes anything", async () => {
    const { giveDay } = await import("./my-week-actions");
    for (const due of ["", "next week", "2026-02-31"]) {
      script("tasks", { data: { board_id: "b1", assignee_id: "me", status: "open" } });
      expect(await giveDay(null, form({ taskId: "t1", due }))).toEqual({ ok: false, error: "Pick a date." });
    }
    expect(updates()).toEqual([]);
  });

  it("refuses a card that is no longer open", async () => {
    script("tasks", { data: { board_id: "b1", assignee_id: "me", status: "done" } });
    const { giveDay } = await import("./my-week-actions");
    expect(await giveDay(null, form({ taskId: "t1", due: "2026-10-08" }))).toEqual({ ok: false, error: "This card is no longer open." });
    expect(updates()).toEqual([]);
  });

  it("says a failed write failed", async () => {
    script("tasks", { data: { board_id: "b1", assignee_id: "me", status: "open" } }, { error: { message: "permission denied" } });
    const { giveDay } = await import("./my-week-actions");
    expect(await giveDay(null, form({ taskId: "t1", due: "2026-10-08" }))).toEqual({ ok: false, error: "permission denied" });
  });
});

// W.173: Start, Next up's button. It moves the reader's own open card from its
// board's first column to the next live one, the column My Week reads as
// "started", and lets landCard do the landing.
describe("startCard", () => {
  const columns = {
    data: [
      { id: "todo", position: 0, is_done: false, is_not_doing: false },
      { id: "doing", position: 1, is_done: false, is_not_doing: false },
      { id: "done", position: 2, is_done: true, is_not_doing: false },
    ],
  };
  const mine = { id: "t1", board_id: "b1", board_column_id: "todo", assignee_id: "me", status: "open", subject_type: null, subject_id: null };

  it("lands the reader's own card in the column after the first", async () => {
    script("tasks", { data: mine });
    script("board_columns", columns);
    script("boards", { data: { slug: "eight-edges" } });
    const { startCard } = await import("./my-week-actions");
    const { landCard } = await import("@/entities/boards/lib/land-card");

    expect(await startCard(null, form({ taskId: "t1" }))).toEqual({ ok: true });
    expect(landCard).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "t1", to: expect.objectContaining({ columnId: "doing", boardSlug: "eight-edges", isDone: false }), logNote: "started from My Week" }),
    );
  });

  it("refuses a card assigned to somebody else", async () => {
    script("tasks", { data: { ...mine, assignee_id: "someone-else" } });
    const { startCard } = await import("./my-week-actions");
    const { landCard } = await import("@/entities/boards/lib/land-card");
    expect(await startCard(null, form({ taskId: "t1" }))).toEqual({ ok: false, error: "Only the person a card is assigned to can start it from My Week." });
    expect(landCard).not.toHaveBeenCalled();
  });

  it("leaves a card that has already started where it is", async () => {
    script("tasks", { data: { ...mine, board_column_id: "doing" } });
    script("board_columns", columns);
    script("boards", { data: { slug: "eight-edges" } });
    const { startCard } = await import("./my-week-actions");
    const { landCard } = await import("@/entities/boards/lib/land-card");
    expect(await startCard(null, form({ taskId: "t1" }))).toEqual({ ok: true });
    expect(landCard).not.toHaveBeenCalled();
  });
});
