import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/kernel/data/testing/fake-company-os";

// The prep draft's validator (English Program PR 3): a block naming an
// exercise not in the session's library is refused, so the draft never saves.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const LIB = [{ id: "6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f" }];

describe("blocksFromOutput", () => {
  it("accepts library blocks and free lines, in order", async () => {
    const { blocksFromOutput } = await import("./prep-draft");
    const res = blocksFromOutput(
      { blocks: [{ side: "presentation", exercise_id: LIB[0]!.id, text: "", minutes: 14 }, { side: "reactive", exercise_id: "", text: "Pressure: ask back", minutes: 20 }], reasoning: "r", homework: "h" },
      LIB,
    );
    expect(res).toEqual({ ok: true, blocks: [{ side: "presentation", exerciseId: LIB[0]!.id, text: null, minutes: 14 }, { side: "reactive", exerciseId: null, text: "Pressure: ask back", minutes: 20 }] });
  });

  it("refuses an exercise the library does not have, and an empty draft", async () => {
    const { blocksFromOutput } = await import("./prep-draft");
    const unknown = blocksFromOutput({ blocks: [{ side: "reactive", exercise_id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", text: "", minutes: 10 }], reasoning: "", homework: "" }, LIB);
    expect(unknown.ok).toBe(false);
    expect(!unknown.ok && unknown.error).toMatch(/not in the library/);
    expect(blocksFromOutput({ blocks: [], reasoning: "", homework: "" }, LIB)).toEqual({ ok: false, error: "The draft had no blocks." });
  });
});
