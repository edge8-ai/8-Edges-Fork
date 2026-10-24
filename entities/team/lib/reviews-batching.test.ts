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
// TH.13: telling the Inbox has its own tests (reviews/ask-raters.test.ts); here
// it is a spy, so these pin which parts each path hands it.
const askRaters = vi.hoisted(() => vi.fn(async (ids: readonly string[]) => ids.length));
vi.mock("./reviews/ask-raters", () => ({ askRaters }));
vi.mock("@/entities/team/lib/reviews/ask-raters", () => ({ askRaters }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://edge8.example" }));

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
import { addReviewer } from "./reviews/requests";

const countFor = (table: string) => calls.filter((c) => c.table === table).length;

beforeEach(() => {
  resetFake();
  askRaters.mockClear();
});

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
    // Both parts are handed to the Inbox; the one that already existed is a no-op there.
    expect(askRaters).toHaveBeenCalledWith(["self-1", "mgr-1"]);
  });

  it("tells nobody when the cycle already existed (TH.13)", async () => {
    script("performance_reviews", { data: [{ id: "self-1", rater_kind: "self" }, { id: "mgr-1", rater_kind: "manager" }] });
    await openReviewCycle({ teamMemberId: "tm1", managerId: "tm9", reviewType: "midyear", cycleLabel: "2026-midyear" });
    expect(askRaters).not.toHaveBeenCalled();
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

describe("runReviewScheduler (TH.13)", () => {
  it("tells the Inbox about every part still waiting, not only those due a reminder", async () => {
    script("team_members", { data: [] }); // no member has a moment today
    script(
      "performance_reviews",
      { data: [] }, // the probation-history read
      {
        data: [
          // Opened 2026-08-24: 56 days old, past the reminder ceiling, so no email goes.
          { id: "old-mgr", team_member_id: "sam", reviewer_id: "lee", review_type: "probation", rater_kind: "manager", created_at: "2026-08-24T02:00:00Z", reviewer_email: null, access_token: null },
          // Opened 4 days ago: not a reminder day either.
          { id: "new-self", team_member_id: "an", reviewer_id: "an", review_type: "midyear", rater_kind: "self", created_at: "2026-10-15T02:00:00Z", reviewer_email: null, access_token: null },
        ],
      },
    );

    const result = await runReviewScheduler("2026-10-19");

    expect(askRaters).toHaveBeenCalledWith(["old-mgr", "new-self"]);
    expect(result.toldInInbox).toBe(2);
    expect(result.remindersSent).toBe(0);
  });
});

describe("addReviewer (TH.13)", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "rev-1", team_member_id: "sam", reviewer_id: "ana", cycle_label: "probation-2026", review_type: "probation", rater_kind: "reviewer",
    status: "open", submitted_at: null, ratings: null, achievements: null, improvements: null, comments: null, decision: null, keeper: null,
    metadata: null, reviewer_email: null, reviewer_name: null, access_token: null, link_sent_at: null, ...over,
  });

  it("tells a new team reviewer's Inbox", async () => {
    script("performance_reviews", { data: null }, { data: row({}) }); // no existing row, then the insert
    script("team_members", { data: { people: { full_name: "Ana Silva", first_name: null, preferred_name: null, email: null } } });
    const r = await addReviewer({ teamMemberId: "sam", cycleLabel: "probation-2026", reviewType: "probation", reviewer: { kind: "team", teamMemberId: "ana" } });
    expect(r.ok).toBe(true);
    expect(askRaters).toHaveBeenCalledWith(["rev-1"]);
  });

  it("tells nobody about an external reviewer, who has no Inbox", async () => {
    script("performance_reviews", { data: null }, { data: row({ id: "ext-1", rater_kind: "external", reviewer_id: null, reviewer_email: "c@client.example", access_token: "t" }) });
    const r = await addReviewer({ teamMemberId: "sam", cycleLabel: "probation-2026", reviewType: "probation", reviewer: { kind: "external", email: "c@client.example", name: "Client" } });
    expect(r.ok).toBe(true);
    expect(askRaters).not.toHaveBeenCalled();
  });
});
