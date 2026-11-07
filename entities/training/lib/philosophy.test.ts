import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The philosophy (TR.5): a seed missing a field is rejected before anything
// could be written, and a save reaches only the organiser's own plan.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

beforeEach(() => resetFake());
afterEach(() => vi.clearAllMocks());

const FULL = {
  purpose: "Clarity, not fluency.",
  halves: { presentation: "Drills and email English.", reactive: "Improvisation under pressure.", split: 50 },
  group_for: "Team work and presentations.",
  one_on_one_for: "Fine-tuning.",
  pressure_rule: "From session one.",
  homework_rule: "A recording brought to the next class.",
  good_looks_like: [{ line: "Asks a clarifying question instead of guessing", side: "reactive" as const }],
  source: "Dave and Hoan, 12 Oct 2026",
};

describe("Philosophy", () => {
  it("accepts the full brief and rejects one missing a field, a blank field or an unknown side", async () => {
    const { Philosophy } = await import("./philosophy");
    expect(Philosophy.safeParse(FULL).success).toBe(true);
    const { homework_rule: _dropped, ...missing } = FULL;
    expect(Philosophy.safeParse(missing).success).toBe(false);
    expect(Philosophy.safeParse({ ...FULL, purpose: "   " }).success).toBe(false);
    expect(Philosophy.safeParse({ ...FULL, good_looks_like: [{ line: "x", side: "both" }] }).success).toBe(false);
    expect(Philosophy.safeParse({ ...FULL, halves: { ...FULL.halves, split: 120 } }).success).toBe(false);
  });
});

describe("savePhilosophy", () => {
  it("writes the brief with who wrote it and when, on the organiser's own plan only", async () => {
    const { savePhilosophy } = await import("./philosophy");
    const now = new Date("2026-10-12T05:00:00Z");
    script("training_plans", { data: [{ id: "p1" }] }, { data: null });
    expect(await savePhilosophy("hoan", "p1", FULL, now)).toEqual({ ok: true });
    const update = calls.filter((c) => c.table === "training_plans" && c.ops.includes("update"))[0];
    expect(update?.payloads[0]).toEqual({ philosophy: FULL, philosophy_updated_at: now.toISOString(), philosophy_updated_by: "hoan" });
    expect(update?.filters).toContainEqual(["eq", "organiser_id", "hoan"]);
  });

  it("refuses a plan the organiser does not run", async () => {
    const { savePhilosophy } = await import("./philosophy");
    script("training_plans", { data: [] });
    expect(await savePhilosophy("hoan", "p1", FULL, new Date())).toEqual({ ok: false, error: "That plan was not found." });
    expect(calls.filter((c) => c.ops.includes("update"))).toEqual([]);
  });
});
