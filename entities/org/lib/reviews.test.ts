import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// OV.7. A failed read of performance_reviews used to render as "Nothing to fill
// in right now": every read logged its error and went on with `data ?? []`. Now
// a read whose emptiness would be a wrong answer raises, and the two writers
// that act on a read say they could not, rather than acting on a guess.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

vi.mock("./surveys-schema", async (importActual) => ({ ...(await importActual<typeof import("./surveys-schema")>()), parseStoredAnswer: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: vi.fn() }));

import { ReadFailure } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { getAccess } from "@/kernel/identity/access-request";
import { finalizeReview, getMemberReviewHistory, getReviewDetail, listReviews, openReviewCycle } from "./reviews";

const ME = "11111111-1111-4111-8111-111111111111";
const actor = { teamMemberId: ME } as TeamActor;
const failed = { error: { message: "connection reset" } };

beforeEach(() => resetFake());

describe("listReviews (OV.7)", () => {
  it("raises when the person's own reviews cannot be read, instead of showing nothing to do", async () => {
    script("performance_reviews", failed, { data: [] });
    await expect(listReviews(actor)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("raises when the reviews they write cannot be read", async () => {
    script("performance_reviews", { data: [] }, failed);
    await expect(listReviews(actor)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("lists an open self-assessment as to do when both reads succeed", async () => {
    const row = { id: "r1", team_member_id: ME, rater_kind: "self", review_type: "midyear", status: "open", submitted_at: null, cycle_label: "midyear-2026", decision: null };
    script("performance_reviews", { data: [row] }, { data: [] });
    script("team_members", { data: [{ id: ME, people: { full_name: "Rowan Tran" } }] });
    const lists = await listReviews(actor);
    expect(lists.todo.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("the other reads and writers in reviews.ts (OV.7)", () => {
  it("raises on a failed history read rather than saying the person has no reviews", async () => {
    script("performance_reviews", failed);
    await expect(getMemberReviewHistory(ME)).rejects.toBeInstanceOf(ReadFailure);
  });

  it("says finalizing could not load the review, not that it was not found", async () => {
    script("performance_reviews", failed);
    expect(await finalizeReview(actor, "22222222-2222-4222-8222-222222222222")).toEqual({ ok: false, error: "Could not load the review." });
  });

  it("opens no cycle when it cannot tell which rows already exist, so a rerun never doubles one", async () => {
    script("performance_reviews", failed);
    const cycle = await openReviewCycle({ teamMemberId: ME, managerId: ME, reviewType: "midyear", cycleLabel: "midyear-2026" });
    expect(cycle).toEqual({ created: 0, selfId: null, managerId: null });
    expect(calls.some((c) => c.ops.includes("insert"))).toBe(false);
  });
});

// CR.3.3: a client review has its own reader (./client-reviews/team-view),
// which asks the client review rules what each viewer sees. getReviewDetail
// refuses one for everybody, so the company's own visibility rules (a coach
// sees any submitted self-assessment, a pay holder sees everything) can never
// decide a client review, whoever calls it.
describe("getReviewDetail on a client review", () => {
  const SUBJECT = "55555555-5555-4555-8555-555555555555";
  const SELF = "66666666-6666-4666-8666-666666666666";
  const self = {
    id: SELF, team_member_id: SUBJECT, reviewer_id: SUBJECT, cycle_label: "client:c2", review_type: "client",
    rater_kind: "self", status: "submitted", submitted_at: "2026-11-12T00:00:00Z", ratings: { teamwork: 4 },
    achievements: "x", improvements: null, comments: null, decision: null, keeper: null, metadata: {},
    reviewer_email: null, reviewer_name: null, access_token: null, link_sent_at: null,
  };
  const coach = async () => true;
  const viewers: Array<[string, TeamActor, unknown]> = [
    ["a coach", actor, { may: () => false }],
    ["a pay holder", actor, { may: (p: string) => p === "people.pay" }],
    ["a review admin", actor, { may: (p: string) => p === "org.reviews" }],
    ["the member", { teamMemberId: SUBJECT } as TeamActor, { may: () => false }],
    ["someone with no access", actor, null],
  ];

  for (const [who, viewer, access] of viewers) {
    it(`refuses ${who}, after reading only the row the id names`, async () => {
      vi.mocked(getAccess).mockResolvedValue(access as never);
      script("performance_reviews", { data: self });
      expect(await getReviewDetail(viewer, SELF, coach)).toBeNull();
      expect(calls.filter((c) => c.table === "performance_reviews")).toHaveLength(1);
    });
  }

  it("leaves client reviews out of the history's own read: released ones come through their reader", async () => {
    script("performance_reviews", { data: [] });
    script("review_cycle_members", { data: [] });
    await getMemberReviewHistory(SUBJECT);
    const read = calls.find((c) => c.table === "performance_reviews");
    expect(read?.filters).toContainEqual(["neq", "review_type", "client"]);
  });
});
