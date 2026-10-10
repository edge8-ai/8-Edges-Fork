import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake } from "@/kernel/data/testing/fake-company-os";

// W.141: a negative Human Tokens figure used to be cleaned to null and saved,
// so typing -1 on a card sized 2 wiped its estimate and reported success.
// Every write path now refuses it, and "no estimate" is still a null.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./mutation", () => ({
  boardMutation: vi.fn(async () => ({ ok: true, actor: { label: "tester", personId: "p1", isAdmin: true }, row: { id: "t1", board_id: "b1", parent_task_id: null, human_tokens: 2, title: "T", metadata: {} } })),
}));

const { NEGATIVE_TOKENS } = await import("./tokens");
const { createCardInput } = await import("./schemas");
const { setTaskTokens } = await import("./token-actions");
const { updateCard } = await import("./actions");

describe("a negative Human Tokens figure", () => {
  it("is refused by the create schema, and a null estimate still passes", () => {
    const base = { boardId: "b1", columnId: "c1", title: "T" };
    const refused = createCardInput.safeParse({ ...base, humanTokens: -1 });
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error?.issues)).toContain(NEGATIVE_TOKENS);
    expect(createCardInput.safeParse({ ...base, humanTokens: null }).success).toBe(true);
  });

  it("is refused by a subtask's own estimate", async () => {
    resetFake();
    expect(await setTaskTokens("t1", -0.5, "b")).toEqual({ ok: false, error: NEGATIVE_TOKENS });
  });

  it("is refused by the drawer's Save", async () => {
    resetFake();
    expect(await updateCard("t1", { humanTokens: -1 }, "b")).toEqual({ ok: false, error: NEGATIVE_TOKENS });
  });
});
