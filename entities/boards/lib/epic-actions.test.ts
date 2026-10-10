import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { EPIC_COLORS } from "./types";

// W.153: an epic is created from the card's epic picker, by whoever is on the
// board. The picker calls createEpic with the name it was typed and nothing
// else, so the action has to make every other choice itself: the board, the
// colour, that it is active, and the id the picker then puts on the card.
// Refusing a non-member is proved once for every board mutation in
// actions.test.ts; this is the path the picker relies on when the answer is yes.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/boards/lib/access", () => ({
  boardActorFor: vi.fn(async () => ({ label: "Member", personId: "person-2", isAdmin: false })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

describe("createEpic, as the card's picker calls it", () => {
  it("lets a board member who is not an admin create one, and hands back its id", async () => {
    script("epics", { data: { sort_order: 2 } }, { data: { id: "epic-new" } });
    const { createEpic } = await import("./epic-actions");

    const res = await createEpic("board-1", { name: "  Onboarding  " }, "eight-edges");

    expect(res).toEqual({ ok: true, id: "epic-new" });
    const insert = calls.find((c) => c.table === "epics" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toMatchObject({
      board_id: "board-1",
      name: "Onboarding",
      status: "active",
      // The next colour after the last epic made on this board, so two epics
      // created in a row from two cards do not look alike.
      color: EPIC_COLORS[3 % EPIC_COLORS.length],
      sort_order: 3,
    });
  });

  it("audits the new epic under the member who made it", async () => {
    script("epics", { data: null }, { data: { id: "epic-first" } });
    const { createEpic } = await import("./epic-actions");
    const { recordAudit } = await import("@/kernel/audit/audit");

    await createEpic("board-1", { name: "Hiring" }, "eight-edges");

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ table: "epics", recordId: "epic-first", operation: "insert", actor: "Member" }));
  });

  it("refuses a blank name before it writes anything", async () => {
    const { createEpic } = await import("./epic-actions");
    expect(await createEpic("board-1", { name: "   " }, "eight-edges")).toEqual({ ok: false, error: "Name the epic." });
    expect(calls.filter((c) => c.ops.includes("insert"))).toEqual([]);
  });
});
