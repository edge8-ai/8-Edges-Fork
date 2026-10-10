import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// K.69. Two readers in this module destructured `const [{ data }, ...]` out of a
// Promise.all and never bound `error`, so a failed Supabase read reached the
// model as the affirmative sentences "(no FAST goals set yet)" and "(no open
// commitments)" — in the prep, the recap and the trend. That is CLAUDE.md rule
// 2's A.12 failure with the model as the reader: a coach is handed a brief that
// states, in the product's own voice, something nobody checked.
//
// The gate could not catch it. check-read-errors matches `const {` immediately
// before the await, so it never saw either statement (card A.23).

// loadGoalsBlock reads goals once; loadOpenCommitments reads the open
// commitments and the last held 1-1 once each. The kernel fake answers each in
// turn and throws on anything unscripted.
type Res = { data?: unknown; error?: { message: string } };
const scriptGoals = (goals: Res = { data: [] }) => script("goals", goals);
const scriptCommitments = (commitments: Res = { data: [] }, lastHeld: Res = { data: null }) => {
  script("coaching_commitments", commitments);
  script("coaching_one_on_ones", lastHeld);
};

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("./data/goals", () => ({
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
}));

const { loadGoalsBlock, loadOpenCommitments } = await import("./ai-blocks");

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a failed read never reads as an empty list", () => {
  it("does not tell the model the person has no goals when the goals read failed", async () => {
    scriptGoals({ error: { message: "connection reset" } });
    const block = await loadGoalsBlock("p-1");
    expect(block).not.toContain("no FAST goals set yet");
    expect(block.toLowerCase()).toContain("could not be read");
  });

  it("does not tell the model the person owes nothing when the commitments read failed", async () => {
    scriptCommitments({ error: { message: "connection reset" } });
    const block = await loadOpenCommitments("p-1");
    expect(block).not.toContain("no open commitments");
    expect(block.toLowerCase()).toContain("could not be read");
  });

  it("still says plainly that there are none when there genuinely are none", async () => {
    // The other half, and the reason this is not just "log louder": an empty
    // list is a real answer the model should act on.
    scriptGoals();
    scriptCommitments();
    expect(await loadGoalsBlock("p-1")).toBe("(no FAST goals set yet)");
    expect(await loadOpenCommitments("p-1")).toBe("(no open commitments)");
  });

  it("keeps the commitments when only the last-held lookup fails", async () => {
    // A degraded flag is not a failed block: losing "carried over from a prior
    // 1-1" is acceptable, losing the commitments is not.
    scriptCommitments(
      { data: [{ title: "Ship the thing", owner: "member", due_on: null, status: "open", status_note: null, created_at: "2026-09-01" }] },
      { error: { message: "timeout" } },
    );
    const block = await loadOpenCommitments("p-1");
    expect(block).toContain("Ship the thing");
    expect(block).not.toContain("carried over");
  });
});
