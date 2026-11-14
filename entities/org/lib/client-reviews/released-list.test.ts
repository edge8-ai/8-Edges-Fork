import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.3: a client review joins the lists beside a person's other reviews only
// once released, never while the member is withdrawn, and always linked to the
// member's own part, where the rules decide again what the reader sees.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { releasedClientReviews } from "./released-list";

const TAM = "55555555-5555-4555-8555-555555555555";
const BAO = "66666666-6666-4666-8666-666666666666";
const NOV = "11111111-1111-4111-8111-111111111111";

beforeEach(() => resetFake());

describe("releasedClientReviews", () => {
  it("asks for released, not withdrawn places only, and links each to the member's own part", async () => {
    script("review_cycle_members", {
      data: [
        { cycle_id: NOV, team_member_id: TAM, released_at: "2026-11-21T02:30:00Z", review_cycles: { name: "November 2026" } },
        { cycle_id: NOV, team_member_id: BAO, released_at: "2026-11-22T02:30:00Z", review_cycles: { name: "November 2026" } },
      ],
    });
    script("performance_reviews", { data: [{ id: "tam-self", team_member_id: TAM, review_cycle_id: NOV }, { id: "bao-self", team_member_id: BAO, review_cycle_id: NOV }] });

    expect(await releasedClientReviews([TAM, BAO])).toEqual([
      { partId: "bao-self", teamMemberId: BAO, cycleName: "November 2026", releasedAt: "2026-11-22T02:30:00Z" },
      { partId: "tam-self", teamMemberId: TAM, cycleName: "November 2026", releasedAt: "2026-11-21T02:30:00Z" },
    ]);
    const places = calls.find((c) => c.table === "review_cycle_members");
    expect(places?.filters).toContainEqual(["not", "released_at", "is", null]);
    expect(places?.filters).toContainEqual(["is", "withdrawn_at", null]);
    const parts = calls.find((c) => c.table === "performance_reviews");
    expect(parts?.filters).toContainEqual(["eq", "review_type", "client"]);
    expect(parts?.filters).toContainEqual(["eq", "rater_kind", "self"]);
  });

  it("reads nothing for nobody, and stops when nothing is released", async () => {
    expect(await releasedClientReviews([])).toEqual([]);
    script("review_cycle_members", { data: [] });
    expect(await releasedClientReviews([TAM])).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual(["review_cycle_members"]);
  });

  it("throws on a failed read rather than answering that nothing was released", async () => {
    script("review_cycle_members", { error: { message: "read failed" } });
    await expect(releasedClientReviews([TAM])).rejects.toThrow(/read failed/);
  });
});
