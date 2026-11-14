import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.3: the owner's last steps on one member's client review. Each asks the
// owner rules through reviewFor, writes only while the row is as the rule saw
// it, and a waiver and a release each leave an audit record. A closed cycle
// still allows all three; one's own review allows none.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ audit: vi.fn(async (_entry: unknown) => {}) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import { releaseClientReview, saveHrSummary, waiveSkipManagerMark } from "./release";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const TAM = "55555555-5555-4555-8555-555555555555";
const BY = { personId: "mai", email: "mai@example.com", ownTeamMemberIds: ["tm-mai"] };

const cycle = (over: Record<string, unknown> = {}) => ({
  id: CYCLE, name: "November 2026", closed_at: null, company_id: "c", framework_id: "fw", opened_by: "mai",
  skip_manager_person_id: "tim", skip_manager_link_cancelled_at: null, ...over,
});
const member = (over: Record<string, unknown> = {}) => ({
  team_member_id: TAM, client_manager_person_id: "roshini", withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null, ...over,
});
const part = (kind: string, status: string) => ({
  id: `${TAM}-${kind}`, team_member_id: TAM, rater_kind: kind, review_type: "client", status, submitted_at: status === "submitted" ? "2026-11-18T00:00:00Z" : null,
  ratings: {}, achievements: null, improvements: null, comments: null, metadata: {}, access_token: null,
});

/** The reads reviewFor makes: the cycle, the member's row, and their parts. */
function review({ cycleOver = {}, memberOver = {}, skip = "open", cm = "submitted" }: { cycleOver?: Record<string, unknown>; memberOver?: Record<string, unknown>; skip?: string; cm?: string } = {}) {
  script("review_cycles", { data: [cycle(cycleOver)] });
  script("review_cycle_members", { data: [member(memberOver)] }, { data: [{ team_member_id: TAM }] });
  script("performance_reviews", { data: [part("self", "submitted"), part("client_manager", cm), part("skip_manager", skip)] });
}

const writes = () => calls.filter((c) => c.table === "review_cycle_members" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  h.audit.mockClear();
});

describe("saveHrSummary", () => {
  it("saves the summary trimmed, only while the review is not released", async () => {
    review();
    expect(await saveHrSummary(CYCLE, TAM, "  Reliable releases.  ", BY)).toEqual({ ok: true });
    expect(writes()[0].payloads[0]).toEqual({ hr_summary: "Reliable releases." });
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["is", "released_at", null]]));
  });

  it("saves after the cycle closes, and refuses once released", async () => {
    review({ cycleOver: { closed_at: "2026-12-05T00:00:00Z" } });
    expect(await saveHrSummary(CYCLE, TAM, "x", BY)).toEqual({ ok: true });
    resetFake();
    review({ memberOver: { released_at: "2026-11-21T00:00:00Z" } });
    expect(await saveHrSummary(CYCLE, TAM, "x", BY)).toEqual({ ok: false, error: "This review is released, so it stays as it was." });
  });

  it("refuses the member acting on their own review before reading anything", async () => {
    expect(await saveHrSummary(CYCLE, TAM, "x", { ...BY, ownTeamMemberIds: [TAM] })).toEqual({ ok: false, error: "This is your own review, so a colleague acts on it." });
    expect(calls).toEqual([]);
  });

  // The boundary review on PR 2608: a person's second engagement row is still them.
  it("refuses the member through any of their team-member rows", async () => {
    const own = { ...BY, ownTeamMemberIds: ["tm-other-engagement", TAM] };
    const refused = { ok: false, error: "This is your own review, so a colleague acts on it." };
    expect(await saveHrSummary(CYCLE, TAM, "x", own)).toEqual(refused);
    expect(await waiveSkipManagerMark(CYCLE, TAM, own)).toEqual(refused);
    expect(await releaseClientReview(CYCLE, TAM, own)).toEqual(refused);
    expect(calls).toEqual([]);
  });
});

describe("waiveSkipManagerMark", () => {
  it("waives the mark for this member, once, and records who did it", async () => {
    review();
    expect(await waiveSkipManagerMark(CYCLE, TAM, BY)).toEqual({ ok: true });
    expect(writes()[0].payloads[0]).toMatchObject({ skip_waived_at: expect.any(String), skip_waived_by: "mai" });
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["is", "skip_waived_at", null], ["is", "released_at", null]]));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ table: "review_cycle_members", recordId: CYCLE, context: expect.objectContaining({ action: "client_review.skip_mark_waived", teamMemberId: TAM }) }));
  });

  it("refuses a cycle with no skip-manager, and a mark already given", async () => {
    review({ cycleOver: { skip_manager_person_id: null } });
    expect(await waiveSkipManagerMark(CYCLE, TAM, BY)).toEqual({ ok: false, error: "This cycle has no skip-manager, so there is no mark to waive." });
    resetFake();
    review({ skip: "submitted" });
    expect(await waiveSkipManagerMark(CYCLE, TAM, BY)).toEqual({ ok: false, error: "The skip-manager has already marked this member Reviewed." });
    expect(writes()).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("releaseClientReview", () => {
  it("releases once the client manager has sent and the skip-manager has marked, and records it", async () => {
    review({ skip: "submitted" });
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({ ok: true });
    expect(writes()[0].payloads[0]).toMatchObject({ released_at: expect.any(String), released_by: "mai" });
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["is", "released_at", null], ["is", "withdrawn_at", null]]));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ action: "client_review.released", teamMemberId: TAM }) }));
  });

  it("releases after a waiver, and after the cycle closes", async () => {
    review({ memberOver: { skip_waived_at: "2026-11-20T00:00:00Z" } });
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({ ok: true });
    resetFake();
    review({ skip: "submitted", cycleOver: { closed_at: "2026-12-05T00:00:00Z" } });
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({ ok: true });
  });

  it("refuses until the client manager has sent and the mark is given or waived", async () => {
    review({ cm: "open" });
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({ ok: false, error: "The client manager has not sent their part yet." });
    resetFake();
    review();
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({
      ok: false,
      error: "The skip-manager has not marked this member Reviewed. Waive the mark if the review should not wait.",
    });
    expect(writes()).toEqual([]);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("says so when another tab released it first", async () => {
    script("review_cycles", { data: [cycle()] });
    // The member's row as read, then a write that finds it already released.
    script("review_cycle_members", { data: [member()] }, { data: [] });
    script("performance_reviews", { data: [part("self", "submitted"), part("client_manager", "submitted"), part("skip_manager", "submitted")] });
    expect(await releaseClientReview(CYCLE, TAM, BY)).toEqual({ ok: false, error: "This review was released just now. Reload to see it." });
    expect(h.audit).not.toHaveBeenCalled();
  });
});
