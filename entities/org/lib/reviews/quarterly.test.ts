import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// A quarterly review reaches "submitted" only through approveQuarterlyReview,
// and nothing rewrites it once it is past a draft. These pin both.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("../reviews", () => ({ REVIEW_DIMENSIONS: [{ key: "work_quality", label: "Work Quality" }] }));

import { approveQuarterlyReview, editQuarterlyDraft, markQuarterlyDiscussed, quarterlyCycleLabel, recordAgreedCommitment, saveQuarterlyDraft } from "./quarterly";

const draft = { comments: "c", ratings: { work_quality: 4, made_up: 5 }, evidence: {}, achievements: "", improvements: "", suggestedCommitments: [] };
const writes = () => calls.filter((c) => c.table === "performance_reviews" && (c.ops.includes("update") || c.ops.includes("insert")));

describe("quarterly reviews", () => {
  beforeEach(() => resetFake());

  it("labels the cycle by quarter", () => {
    expect(quarterlyCycleLabel("2026Q3")).toBe("2026Q3 quarterly");
  });

  it("refuses to redraft an approved review", async () => {
    script("performance_reviews", { data: [{ id: "r1", rater_kind: "manager", status: "submitted", metadata: {} }] });
    const res = await saveQuarterlyDraft({ teamMemberId: "tm", coachId: "c", quarter: "2026Q3", draft, aiModel: null });
    expect(res.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });

  it("creates the coach's row as a draft and keeps only known dimensions", async () => {
    script("performance_reviews", { data: [] }, { data: { id: "new" } });
    const res = await saveQuarterlyDraft({ teamMemberId: "tm", coachId: "c", quarter: "2026Q3", draft, aiModel: "m" });
    expect(res).toEqual({ ok: true, id: "new" });
    const row = writes()[0].payloads[0] as Record<string, unknown>;
    expect(row).toMatchObject({ status: "draft", rater_kind: "manager", reviewer_id: "c", review_type: "quarterly", cycle_label: "2026Q3 quarterly" });
    expect(row.ratings).toEqual({ work_quality: 4 });
  });

  it("edits only a draft", async () => {
    script("performance_reviews", { data: { metadata: {}, status: "submitted", review_type: "quarterly" } });
    const res = await editQuarterlyDraft("r1", { comments: "x", achievements: "", improvements: "", ratings: {}, evidence: {} });
    expect(res.ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });

  it("approves only a quarterly draft, stamping who approved it", async () => {
    script("performance_reviews", { data: { metadata: {}, status: "draft", review_type: "quarterly", comments: "c" } }, { data: [{ id: "r1" }] });
    expect(await approveQuarterlyReview("r1", "dave")).toEqual({ ok: true });
    const row = writes()[0].payloads[0] as { status: string; metadata: { quarterly: { approved_by: string } } };
    expect(row.status).toBe("submitted");
    expect(row.metadata.quarterly.approved_by).toBe("dave");
  });

  it("will not approve another kind of review", async () => {
    script("performance_reviews", { data: { metadata: {}, status: "draft", review_type: "probation", comments: "c" } });
    expect((await approveQuarterlyReview("r1", "dave")).ok).toBe(false);
    expect(writes()).toHaveLength(0);
  });

  it("marks only an approved review as discussed, which finalizes it", async () => {
    script("performance_reviews", { data: { metadata: {}, status: "draft", review_type: "quarterly" } });
    expect((await markQuarterlyDiscussed("r1")).ok).toBe(false);
    expect(writes()).toHaveLength(0);
    script("performance_reviews", { data: { metadata: {}, status: "submitted", review_type: "quarterly" } }, { data: [{ id: "r1" }] });
    expect(await markQuarterlyDiscussed("r1")).toEqual({ ok: true });
    expect((writes()[0].payloads[0] as { status: string }).status).toBe("finalized");
  });

  it("notes an agreed commitment only while the approved review is discussed", async () => {
    script("performance_reviews", { data: { metadata: { quarterly: { agreed_commitments: ["a"] } }, status: "submitted", review_type: "quarterly" } }, { data: [{ id: "r1" }] });
    expect(await recordAgreedCommitment("r1", " b ")).toEqual({ ok: true });
    const meta = (writes()[0].payloads[0] as { metadata: { quarterly: { agreed_commitments: string[] } } }).metadata;
    expect(meta.quarterly.agreed_commitments).toEqual(["a", "b"]);
    script("performance_reviews", { data: { metadata: {}, status: "finalized", review_type: "quarterly" } });
    expect((await recordAgreedCommitment("r1", "c")).ok).toBe(false);
  });
});
