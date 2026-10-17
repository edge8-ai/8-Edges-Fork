import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Both review paths used to ask the database once per row: openReviewCycle
// checked for an existing row per rater kind, and the scheduler's dry run
// checked for an existing cycle per member per moment. These tests pin the
// batched shape — one read for the whole set — and that the insert-or-skip
// decision that comes out of it is unchanged.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
// reviews.ts reaches identity guards wrapped in React's `cache`, which the
// React resolved in the vitest environment does not provide.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_cache: <T,>(fn: T) => fn }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn(async () => ({ ok: true })) }));

// Imported at the top rather than inside the tests. The graph behind these two
// reaches the coaching and org barrels, and a dynamic import inside an `it`
// charges that transform to the test's own clock: it measured 3180ms of the
// 5000ms budget on a loaded machine, and on 2026-09-22 both tests timed out
// together at 5004ms — the second only because the first never got far enough to
// leave the modules cached for it. At the top the graph is paid once during file
// collection, which no test timeout governs, and both assertions measure 1ms.
// vitest hoists `vi.mock` above every import, so the mocks above still apply.
import { openReviewCycle } from "./reviews";
import { runReviewScheduler } from "./review-scheduler";

const countFor = (table: string) => calls.filter((c) => c.table === table).length;

beforeEach(() => resetFake());

describe("openReviewCycle", () => {
  it("reads both rater kinds in one query and inserts only the missing side", async () => {
    script(
      "performance_reviews",
      { data: [{ id: "self-1", rater_kind: "self" }] }, // the batched existence read
      { data: { id: "mgr-1" } }, // the manager insert
    );

    const result = await openReviewCycle({
      teamMemberId: "tm1",
      managerId: "tm9",
      reviewType: "midyear",
      cycleLabel: "2026-midyear",
    });

    // One read plus one insert — the read is no longer per rater kind.
    expect(countFor("performance_reviews")).toBe(2);
    expect(result).toEqual({ created: 1, selfId: "self-1", managerId: "mgr-1" });
  });
});

describe("runReviewScheduler (dry run)", () => {
  it("reads existing cycles once for every member", async () => {
    const members = Array.from({ length: 4 }, (_, i) => ({
      id: `tm${i}`,
      manager_id: "mgr",
      start_date: "2026-08-01",
      contract_start_date: null,
      people: { full_name: `Member ${i}`, first_name: null, preferred_name: null, email: `m${i}@example.com` },
    }));
    script("team_members", { data: members }, { data: [] }); // members, then manager emails
    script(
      "performance_reviews",
      { data: [] }, // the probation-history read
      { data: [] }, // the batched dry-run cycle read
      { data: [] }, // the pending-reminders read
    );

    const result = await runReviewScheduler("2026-09-12", { dryRun: true });

    // Four members, each with a probation moment in window: three reads total,
    // none of them per member.
    expect(countFor("performance_reviews")).toBe(3);
    expect(result.opened).toHaveLength(4);
  });
});
