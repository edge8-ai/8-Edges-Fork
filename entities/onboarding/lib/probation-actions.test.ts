import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin Home's probation buttons (AH.5): decideProbation asks onboarding.manage
// before anything else, so a person without it never reaches the decision.
// The real requirePermission redirects a refusal; here it throws, which is
// what a redirect does to the code after it.
const gate = vi.hoisted(() => ({ allowed: true, asked: [] as string[] }));
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    gate.asked.push(p);
    if (!gate.allowed) throw new Error("NEXT_REDIRECT");
    return { user: { email: "admin@example.com" }, personId: "person-1" };
  },
}));
vi.mock("@/kernel/identity/team-people", () => ({ teamSelfOf: async () => ({ teamMemberId: "tm-admin", greeting: null }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const applied = vi.hoisted(() => ({ calls: [] as unknown[], result: { ok: true } as { ok: true } | { ok: false; error: string } }));
vi.mock("./probation-decision", () => ({
  applyProbationDecision: async (input: unknown) => (applied.calls.push(input), applied.result),
}));

const { decideProbation } = await import("./probation-actions");

beforeEach(() => {
  gate.allowed = true;
  gate.asked = [];
  applied.calls = [];
  applied.result = { ok: true };
});

describe("decideProbation", () => {
  it("refuses a person without onboarding.manage before any decision is applied", async () => {
    gate.allowed = false;
    await expect(decideProbation("tm-1", "offer_full_time")).rejects.toThrow("NEXT_REDIRECT");
    expect(gate.asked).toEqual(["onboarding.manage"]);
    expect(applied.calls).toEqual([]);
  });

  it("records the admin's decision through the shared core, with who decided", async () => {
    expect(await decideProbation("tm-1", "extend_probation_30")).toEqual({ ok: true });
    expect(applied.calls).toEqual([{ subjectTeamMemberId: "tm-1", decision: "extend_probation_30", decidedByTmId: "tm-admin", actorEmail: "admin@example.com" }]);
  });

  it("refuses a decision it does not know, and passes the core's refusal on", async () => {
    expect(await decideProbation("tm-1", "promote" as never)).toEqual({ ok: false, error: "Unknown decision." });
    applied.result = { ok: false, error: "This person is not on probation, so there is no decision to record." };
    expect(await decideProbation("tm-1", "offer_full_time")).toEqual(applied.result);
  });
});
