import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// OV.7. A failed read of performance_reviews used to render as "Nothing to fill
// in right now": every read logged its error and went on with `data ?? []`. Now
// a read whose emptiness would be a wrong answer raises, and the two writers
// that act on a read say they could not, rather than acting on a guess.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/entities/coaching", () => ({ selectCoachingProfiles: vi.fn() }));
vi.mock("@/entities/org", () => ({ parseStoredAnswer: vi.fn() }));
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: vi.fn() }));
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: vi.fn() }));

import { ReadFailure } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { finalizeReview, getMemberReviewHistory, listReviews, openReviewCycle } from "./reviews";

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
