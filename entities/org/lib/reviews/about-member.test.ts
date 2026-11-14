import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Boundary review on #2584: the team assistant's "my reviews" tool reads
// through this function, so it must never hand a member the client manager's
// or skip-manager's part of a client review.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { reviewsAboutMember } from "./about-member";

beforeEach(() => resetFake());

describe("reviewsAboutMember", () => {
  it("asks only for the member's own part of a client review, and every part of the company's own reviews", async () => {
    script("performance_reviews", { data: [] });
    await reviewsAboutMember("ana");
    const read = calls.find((c) => c.table === "performance_reviews");
    expect(read?.filters).toContainEqual(["eq", "team_member_id", "ana"]);
    expect(read?.filters).toContainEqual(["or", "review_type.neq.client,rater_kind.eq.self"]);
  });
});
