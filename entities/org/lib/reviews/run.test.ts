import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// How a submission lands on a review row. The CR.2 code review: a client part
// is signed by its confirmations on every send, so a resend after the owner
// reopened it is stamped with the resend's time, while the company's own
// reviews keep their first submission time when a manager re-edits them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/team-auth", () => ({ getTeamActor: vi.fn(async () => ({ actor: { email: "tam@example.com" } })) }));
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: vi.fn() }));
const h = vi.hoisted(() => ({
  publish: vi.fn(async (_name: string, _payload: unknown) => {}),
  notice: vi.fn(async (_part: unknown, _sentAt: string, _updated?: boolean): Promise<unknown> => null),
  audit: vi.fn(async (_input: unknown) => {}),
}));
vi.mock("@/kernel/events", () => ({ publish: h.publish }));
vi.mock("../client-reviews/part-sent", () => ({ partSentNotice: h.notice }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: h.audit }));

import type { ReviewRow } from "../reviews";
import type { SurveyFieldRow } from "../surveys-schema";
import { applyReviewSubmission } from "./run";

const EARLIER = "2026-11-14T08:00:00.000Z";

const row = (over: Partial<ReviewRow>): ReviewRow =>
  ({
    id: "r1",
    team_member_id: "m1",
    reviewer_id: null,
    rater_kind: "self",
    review_type: "client",
    status: "open",
    submitted_at: EARLIER,
    ratings: {},
    metadata: {},
    achievements: null,
    improvements: null,
    comments: null,
    decision: null,
    keeper: null,
    ...over,
  }) as ReviewRow;

const noFields: SurveyFieldRow[] = [];

beforeEach(() => {
  resetFake();
  h.publish.mockClear();
  h.audit.mockClear();
  h.notice.mockReset();
  h.notice.mockResolvedValue(null);
});

describe("applyReviewSubmission", () => {
  it("stamps a resent client part with this send's time", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    expect(await applyReviewSubmission(row({ review_type: "client" }), noFields, new Map())).toEqual({ ok: true });
    const stamped = (calls.find((c) => c.ops.includes("update"))?.payloads[0] as { submitted_at: string }).submitted_at;
    expect(stamped).not.toBe(EARLIER);
  });

  it("keeps a company review's first submission time when it is re-edited", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    expect(await applyReviewSubmission(row({ review_type: "midyear", rater_kind: "manager", status: "submitted" }), noFields, new Map())).toEqual({ ok: true });
    expect(calls.find((c) => c.ops.includes("update"))?.payloads[0]).toMatchObject({ submitted_at: EARLIER });
  });

  it("only writes a client part that is open, never over a sent one", async () => {
    script("performance_reviews", { data: [] });
    expect(await applyReviewSubmission(row({ review_type: "client" }), noFields, new Map())).toEqual({ ok: false, error: "This review can no longer be edited." });
    expect(calls.find((c) => c.ops.includes("update"))?.filters).toEqual(expect.arrayContaining([["in", "status", ["open", "draft"]]]));
    expect(h.audit).not.toHaveBeenCalled();
  });
});

// CR.6: a member may update the client part they sent while their window is
// open. The run context decides the window; the write only refuses to land
// over a row that changed since it was read.
describe("a member updating the part they sent", () => {
  const sent = () => row({ review_type: "client", rater_kind: "self", status: "submitted" });

  it("writes only over the row as it was read: still sent, at the same time", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    expect(await applyReviewSubmission(sent(), noFields, new Map())).toEqual({ ok: true });
    const update = calls.find((c) => c.ops.includes("update"));
    expect(update?.filters).toEqual(expect.arrayContaining([["eq", "status", "submitted"], ["eq", "submitted_at", EARLIER]]));
    expect(update?.filters.some((f) => f[0] === "in")).toBe(false);
  });

  it("changes nothing when another send got there first", async () => {
    script("performance_reviews", { data: [] });
    expect(await applyReviewSubmission(sent(), noFields, new Map())).toEqual({ ok: false, error: "This review can no longer be edited." });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("records the update with both times and none of the answers, and tells the owner it was an update", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    await applyReviewSubmission(sent(), noFields, new Map());
    const stamped = (calls.find((c) => c.ops.includes("update"))?.payloads[0] as { submitted_at: string }).submitted_at;
    expect(h.audit).toHaveBeenCalledTimes(1);
    const input = h.audit.mock.calls[0][0] as { context: Record<string, unknown> };
    expect(input).toMatchObject({ table: "performance_reviews", recordId: "r1", operation: "update", actor: "tam@example.com" });
    expect(input.context).toEqual({ action: "client_review.member_part_updated", previousSentAt: EARLIER, sentAt: stamped });
    expect(h.notice).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), stamped, true);
  });
});

// CR.2.6: a sent client part tells the person who opened its cycle, through
// the event that settles the rater's ask, and telling her never fails a send.
describe("the event a sent part states", () => {
  const notice = { ownerPersonId: "owner", cycleName: "On Target November 2026", memberName: "Tâm", memberPersonId: "tam", part: "member", overviewPath: "/admin/talent/reviews/clients/c1", sentAt: "x" };

  it("carries the opener's notice for a client part, asked for at this send's time", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    h.notice.mockResolvedValue(notice);
    expect(await applyReviewSubmission(row({ review_type: "client" }), noFields, new Map())).toEqual({ ok: true });
    const stamped = (calls.find((c) => c.ops.includes("update"))?.payloads[0] as { submitted_at: string }).submitted_at;
    expect(h.notice).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), stamped, false);
    expect(h.publish).toHaveBeenCalledWith("review.part.submitted", { reviewId: "r1", client: notice });
  });

  it("still sends the part, and settles its ask, when the notice cannot be read", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] });
    h.notice.mockRejectedValue(new Error("boom"));
    expect(await applyReviewSubmission(row({ review_type: "client" }), noFields, new Map())).toEqual({ ok: true });
    expect(h.publish).toHaveBeenCalledWith("review.part.submitted", { reviewId: "r1" });
  });

  it("never asks for a notice about a company review, or a part that was not written", async () => {
    script("performance_reviews", { data: [{ id: "r1" }] }, { data: [] });
    await applyReviewSubmission(row({ review_type: "midyear", rater_kind: "manager" }), noFields, new Map());
    await applyReviewSubmission(row({ review_type: "client" }), noFields, new Map());
    expect(h.notice).not.toHaveBeenCalled();
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledWith("review.part.submitted", { reviewId: "r1" });
  });
});
