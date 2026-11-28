import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// CR.3.2: what the skip-manager's link may write. A note sits on their own
// part beside one of the rater's questions, marking Reviewed sends that part,
// and the opener hears once when every member still in the cycle is marked.
// Every write asks the rules again, so a request made by hand gets no more
// than the page offers.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const h = vi.hoisted(() => ({ publish: vi.fn(async (_name: string, _payload: unknown) => {}) }));
vi.mock("@/kernel/events", () => ({ publish: h.publish }));

import { markSkipManagerReviewed, saveSkipManagerNote } from "./skip-commands";

const CYCLE = "11111111-1111-4111-8111-111111111111";
const FW = "22222222-2222-4222-8222-222222222222";
const TAM = "55555555-5555-4555-8555-555555555555";
const LOI = "66666666-6666-4666-8666-666666666666";
const TOKEN = "tok-good";

const cycle = (over: Record<string, unknown> = {}) => ({
  id: CYCLE, name: "November 2026", closed_at: null, framework_id: FW, opened_by: "owner", skip_manager_person_id: "tim",
  skip_manager_token: TOKEN, skip_manager_link_cancelled_at: null, company_id: "co-ot", companies: { name: "On Target" }, ...over,
});
const member = (id: string) => ({ team_member_id: id, client_manager_person_id: "roshini", withdrawn_at: null, rater_unlocked_at: null, skip_waived_at: null, released_at: null });
const part = (id: string, kind: string, status: string, metadata: Record<string, unknown> = {}) => ({
  id: `${id}-${kind}`, team_member_id: id, rater_kind: kind, review_type: "client", status, submitted_at: status === "submitted" ? "2026-11-18T00:00:00Z" : null,
  ratings: {}, achievements: null, improvements: null, comments: null, metadata, access_token: null,
});
const partsOf = (id: string, skipStatus = "open", cmStatus = "submitted", skipMeta: Record<string, unknown> = {}) => [
  part(id, "self", "submitted"), part(id, "client_manager", cmStatus), part(id, "skip_manager", skipStatus, skipMeta),
];
const fields = [
  { id: "f1", survey_id: "s", position: 4, type: "rating", label: "Customer Focus", help_text: null, required: true, config: { maps_to: "performance_reviews.ratings.customer_focus" } },
  { id: "f2", survey_id: "s", position: 5, type: "long_text", label: "Customer Focus: comments", help_text: null, required: false, config: { maps_to: "performance_reviews.metadata.comment_customer_focus" } },
];
const KEY = "performance_reviews.ratings.customer_focus";

/** The reads every write starts with: the cycle, then its members and parts. */
function setting(parts = partsOf(TAM), cycleOver: Record<string, unknown> = {}) {
  script("review_cycles", { data: [cycle(cycleOver)] });
  script("review_cycle_members", { data: [member(TAM)] });
  script("performance_reviews", { data: parts });
}

const writes = () => calls.filter((c) => c.table === "performance_reviews" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  h.publish.mockClear();
});

describe("saveSkipManagerNote", () => {
  it("saves a note on the skip-manager's own part, beside the question it names, while that part is open", async () => {
    setting();
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    script("performance_reviews", { data: [{ id: `${TAM}-skip_manager` }] });
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "  Agree with Roshini.  ")).toMatchObject({ ok: true });
    const write = writes()[0];
    expect(write.payloads[0]).toMatchObject({ metadata: { comments: { [KEY]: "Agree with Roshini." } } });
    expect(write.filters).toEqual(expect.arrayContaining([["eq", "id", `${TAM}-skip_manager`], ["in", "status", ["open", "draft"]]]));
  });

  // CR.3.6: a cancelled link stops the link, not the skip-manager signed in,
  // and a sign-in that is not the cycle's skip-manager writes nothing.
  it("saves a note for the skip-manager signed in, with no token, after their link was cancelled", async () => {
    setting(partsOf(TAM), { skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" });
    script("portal_members", { data: [{ person_id: "tim", company_id: "co-ot" }] });
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    script("performance_reviews", { data: [{ id: `${TAM}-skip_manager` }] });
    expect(await saveSkipManagerNote(CYCLE, { token: null, personIds: ["tim"] }, TAM, KEY, "Agree.")).toMatchObject({ ok: true });
    expect(writes()).toHaveLength(1);
  });

  it("refuses the skip-manager signed in with portal access at another client only, writing nothing", async () => {
    setting();
    script("portal_members", { data: [{ person_id: "tim", company_id: "co-elsewhere" }] });
    expect((await markSkipManagerReviewed(CYCLE, { token: null, personIds: ["tim"] }, TAM)).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("refuses a sign-in that is not the cycle's skip-manager, writing nothing", async () => {
    setting();
    expect((await saveSkipManagerNote(CYCLE, { token: null, personIds: ["roshini"] }, TAM, KEY, "x")).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it("clears a note saved empty, keeping the others", async () => {
    setting(partsOf(TAM, "open", "submitted", { comments: { [KEY]: "Old", other: "Keep" } }));
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    script("performance_reviews", { data: [{ id: `${TAM}-skip_manager` }] });
    await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "   ");
    expect((writes()[0].payloads[0] as { metadata: { comments: Record<string, string> } }).metadata.comments).toEqual({ other: "Keep" });
  });

  it("refuses a note beside something that is not one of the rater's questions", async () => {
    setting();
    script("review_frameworks", { data: [{ rater_survey_id: "s" }] });
    script("survey_fields", { data: fields });
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, "performance_reviews.ratings.made_up", "x")).toEqual({ ok: false, error: "That note has no answer to sit beside." });
    expect(writes()).toEqual([]);
  });

  it("refuses a wrong token in the link's own words, and writes nothing", async () => {
    setting();
    expect(await saveSkipManagerNote(CYCLE, { token: "tok-bad!" }, TAM, KEY, "x")).toEqual({ ok: false, error: "This link no longer works. Ask the person who sent it to you for the current link." });
    expect(writes()).toEqual([]);
  });

  it("refuses a member whose client manager has not sent their part", async () => {
    setting(partsOf(TAM, "open", "open"));
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "x")).toEqual({ ok: false, error: "This review is not ready for you yet." });
  });

  it("refuses a note once the member is marked Reviewed", async () => {
    setting(partsOf(TAM, "submitted"));
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "x")).toEqual({ ok: false, error: "You marked this review Reviewed, so its notes can no longer change." });
    expect(writes()).toEqual([]);
  });

  // The boundary review on PR 2606: the link answers for itself before any member is looked up.
  it("answers a cancelled link in its own words, whichever member the request names", async () => {
    script("review_cycles", { data: [cycle({ skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" })] });
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, "99999999-9999-4999-8999-999999999999", KEY, "x")).toEqual({
      ok: false,
      error: "This link no longer works. Ask the person who sent it to you for the current link.",
    });
    expect(calls.some((c) => c.table === "review_cycle_members")).toBe(false);
  });

  it("refuses a cancelled link and a closed cycle", async () => {
    setting(partsOf(TAM), { skip_manager_link_cancelled_at: "2026-11-20T00:00:00Z" });
    expect((await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "x")).ok).toBe(false);
    resetFake();
    setting(partsOf(TAM), { closed_at: "2026-12-05T00:00:00Z" });
    expect(await saveSkipManagerNote(CYCLE, { token: TOKEN }, TAM, KEY, "x")).toEqual({ ok: false, error: "This review has closed, so it can no longer change." });
    expect(writes()).toEqual([]);
  });
});

describe("markSkipManagerReviewed", () => {
  it("sends the skip-manager's part, only from open, and tells nobody while a member is still unmarked", async () => {
    script("review_cycles", { data: [cycle()] });
    script("review_cycle_members", { data: [member(TAM), member(LOI)] }, { data: [member(TAM), member(LOI)] });
    script("performance_reviews", { data: [...partsOf(TAM), ...partsOf(LOI)] }, { data: [{ id: `${TAM}-skip_manager` }] }, { data: [...partsOf(TAM, "submitted"), ...partsOf(LOI)] });
    expect(await markSkipManagerReviewed(CYCLE, { token: TOKEN }, TAM)).toMatchObject({ ok: true });
    expect(writes()[0].payloads[0]).toMatchObject({ status: "submitted" });
    expect(writes()[0].filters).toEqual(expect.arrayContaining([["in", "status", ["open", "draft"]]]));
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("tells the opener once the last member still in the cycle is marked", async () => {
    script("review_cycles", { data: [cycle()] });
    script("review_cycle_members", { data: [member(TAM)] }, { data: [member(TAM)] });
    script("performance_reviews", { data: partsOf(TAM) }, { data: [{ id: `${TAM}-skip_manager` }] }, { data: partsOf(TAM, "submitted") });
    script("people", { data: [{ full_name: "Tim Nguyen", display_name: null, preferred_name: null, email: null, first_name: null, last_name: null }] });
    await markSkipManagerReviewed(CYCLE, { token: TOKEN }, TAM);
    expect(h.publish).toHaveBeenCalledWith("review.cycle.all_marked", {
      cycleId: CYCLE, ownerPersonId: "owner", cycleName: "November 2026", skipManagerName: "Tim Nguyen", members: 1, overviewPath: `/admin/talent/reviews/clients/${CYCLE}`,
    });
  });

  it("still marks the member when telling the opener fails", async () => {
    script("review_cycles", { data: [cycle()] });
    script("review_cycle_members", { data: [member(TAM)] }, { error: { message: "boom" } });
    script("performance_reviews", { data: partsOf(TAM) }, { data: [{ id: `${TAM}-skip_manager` }] }, { data: [] });
    expect(await markSkipManagerReviewed(CYCLE, { token: TOKEN }, TAM)).toMatchObject({ ok: true });
  });

  it("refuses a member already marked", async () => {
    setting(partsOf(TAM, "submitted"));
    expect((await markSkipManagerReviewed(CYCLE, { token: TOKEN }, TAM)).ok).toBe(false);
    expect(writes()).toEqual([]);
  });
});
