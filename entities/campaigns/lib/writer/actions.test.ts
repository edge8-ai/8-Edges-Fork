import { beforeEach, describe, expect, it, vi } from "vitest";

// The hub's verbs. Start refuses without a brand or idea and while a run is in
// flight, otherwise sets the first step and runs it in this request; Retry
// clears the error and runs the step here; Continue runs the step here, only
// for an errorless run; Stop clears the state. Every verb guards first
// (check:action-auth pins that). Since Y.12 the step runs through
// runWriterStepNow, which records it under the step's tick.

// The actions ask for their declared permission first (ADR 0013); recorded so the test pins which.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async (p: string) => (asked.push(p), { user: { email: "admin@example.com" } }) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
// The step files reached through ./advance build the service-role client at import.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));

const campaign: { id: string; name: string; idea: string | null; objective: null; brandId: string | null; pillarId: null; startsOn: null; writerStep: string | null; writerStartedAt: null; writerError: string | null } = {
  id: "c", name: "n", idea: "idea", objective: null, brandId: "b", pillarId: null, startsOn: null, writerStep: null, writerStartedAt: null, writerError: null,
};
const states: unknown[] = [];
// The campaign's post as loadBlogAsset reads it; null for a campaign with none yet.
const post = vi.hoisted(() => ({ blog: null as null | { id: string; status: string } }));
vi.mock("./data", () => ({
  loadCampaign: async () => ({ ok: true, data: { ...campaign } }),
  loadBlogAsset: async () => (post.blog ? { ok: true, data: { ...post.blog } } : { ok: false, error: "The campaign has no blog asset yet." }),
  setWriterState: async (_id: string, s: unknown) => {
    states.push(s);
    return { ok: true };
  },
}));
// The live-edit rule (Y.91) has its own suite (../blog-live-edit.test.ts); here
// only what startWriter asks it and does with its answer.
const live = vi.hoisted(() => ({ refusal: null as string | null, asked: [] as string[] }));
vi.mock("../blog-live-edit", () => ({
  LIVE_EDIT_REFUSAL: "LIVE",
  liveEditRefusal: async (id: string) => (live.asked.push(id), live.refusal),
}));
const runWriterStepNow = vi.fn();
vi.mock("./run-step", () => ({ runWriterStepNow: (id: string) => runWriterStepNow(id) }));

// The Publish approval's own rules are tested in ./publish-approval.test.ts;
// here only what the actions hand it and do with its answer.
const approval = vi.hoisted(() => ({ calls: [] as unknown[][], approve: { ok: true } as { ok: boolean; error?: string }, reject: { ok: true } as { ok: boolean; error?: string } }));
vi.mock("./publish-approval", () => ({
  approvePublish: async (...a: unknown[]) => {
    approval.calls.push(["approve", ...a]);
    return approval.approve;
  },
  rejectPublish: async (...a: unknown[]) => {
    approval.calls.push(["reject", ...a]);
    return approval.reject;
  },
  withdrawPublish: async (...a: unknown[]) => {
    approval.calls.push(["withdraw", ...a]);
    return { ok: true };
  },
}));

const { startWriter, retryWriterStep, continueWriter, stopWriter, publishWriterDraft, rejectWriterDraft } = await import("./actions");
const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  states.length = 0;
  asked.length = 0;
  approval.calls.length = 0;
  approval.approve = { ok: true };
  approval.reject = { ok: true };
  runWriterStepNow.mockReset();
  runWriterStepNow.mockResolvedValue({ ok: true, campaignId: ID, step: "edit", next: "seo", summary: "Edited." });
  Object.assign(campaign, { idea: "idea", brandId: "b", writerStep: null, writerError: null });
  post.blog = null;
  live.refusal = null;
  live.asked.length = 0;
});

describe("startWriter", () => {
  // Y.91: a run rewrites the post in place, so a live post on a campaign that
  // publishes on approval is unpublished first; nothing is withdrawn or started.
  it("refuses to rewrite a live post on a gated campaign, and says to unpublish it first", async () => {
    post.blog = { id: "blog-1", status: "published" };
    live.refusal = "LIVE";
    expect(await startWriter(ID)).toEqual({ ok: false, error: expect.stringMatching(/the writer cannot rewrite it while it is live\. Unpublish it first .*Workboard tab/) });
    expect(live.asked).toEqual(["blog-1"]);
    expect(states).toEqual([]);
    expect(approval.calls).toEqual([]);
    expect(runWriterStepNow).not.toHaveBeenCalled();
    // A failed read is shown as itself, not as the live refusal.
    live.refusal = "The post could not be read, so the edit was not saved.";
    expect(await startWriter(ID)).toEqual({ ok: false, error: "The post could not be read, so the edit was not saved." });
  });
  it("starts on a post the rule lets through (not live, auto-publish, no campaign history) and on a campaign with no post yet", async () => {
    post.blog = { id: "blog-1", status: "published" };
    expect(await startWriter(ID)).toEqual({ ok: true });
    expect(live.asked).toEqual(["blog-1"]);
    post.blog = null;
    expect(await startWriter(ID)).toEqual({ ok: true });
    expect(live.asked).toEqual(["blog-1"]);
  });
  it("rejects a non-uuid id, a campaign without a brand or idea, and a run in flight", async () => {
    expect(await startWriter("nope")).toEqual({ ok: false, error: "Not a campaign id." });
    campaign.brandId = null;
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Set a brand/) });
    campaign.brandId = "b";
    campaign.idea = "";
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Write the campaign idea/) });
    campaign.idea = "idea";
    campaign.writerStep = "seo";
    expect(await startWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/already running/) });
    expect(states).toEqual([]);
    expect(runWriterStepNow).not.toHaveBeenCalled();
  });
  it("sets the first step and runs it in the same request", async () => {
    runWriterStepNow.mockResolvedValue({ ok: true, campaignId: ID, step: "draft", next: "edit", summary: "Drafted." });
    expect(await startWriter(ID)).toEqual({ ok: true });
    expect(states).toEqual([expect.objectContaining({ step: "draft", error: null, startedAt: expect.any(String) })]);
    expect(runWriterStepNow).toHaveBeenCalledWith(ID);
    expect(new Set(asked)).toEqual(new Set(["campaigns.marketing"]));
  });
  it("surfaces the first step's failure", async () => {
    runWriterStepNow.mockResolvedValue({ ok: false, campaignId: ID, step: "draft", error: "Draft: too short." });
    expect(await startWriter(ID)).toEqual({ ok: false, error: "Draft: too short." });
  });
});

describe("retry, continue, stop", () => {
  it("retry clears the error on the current step and runs it here", async () => {
    campaign.writerStep = "edit";
    campaign.writerError = "boom";
    expect(await retryWriterStep(ID)).toEqual({ ok: true });
    // A new start time makes the retried step a new tick (Y.12 review).
    expect(states).toEqual([{ step: "edit", error: null, startedAt: expect.any(String) }]);
    expect(runWriterStepNow).toHaveBeenCalledWith(ID);
  });
  it("retry says when the step fails again", async () => {
    campaign.writerStep = "edit";
    campaign.writerError = "boom";
    runWriterStepNow.mockResolvedValue({ ok: false, campaignId: ID, step: "edit", error: "Edit: still too long." });
    expect(await retryWriterStep(ID)).toEqual({ ok: false, error: "Edit: still too long." });
  });
  it("retry and continue refuse when there is no run", async () => {
    expect(await retryWriterStep(ID)).toMatchObject({ ok: false });
    expect(await continueWriter(ID)).toMatchObject({ ok: false });
    expect(runWriterStepNow).not.toHaveBeenCalled();
  });
  it("continue runs an errorless run's step here and refuses a stopped one", async () => {
    campaign.writerStep = "links";
    expect(await continueWriter(ID)).toEqual({ ok: true });
    expect(runWriterStepNow).toHaveBeenCalledWith(ID);
    campaign.writerError = "boom";
    expect(await continueWriter(ID)).toMatchObject({ ok: false, error: expect.stringMatching(/Retry step/) });
  });
  it("stop clears the state and withdraws a pending Publish approval", async () => {
    campaign.writerStep = "ready";
    expect(await stopWriter(ID)).toEqual({ ok: true });
    expect(states).toEqual([{ step: null, error: null }]);
    expect(approval.calls).toEqual([["withdraw", ID, { personId: undefined, email: "admin@example.com" }, "the run was stopped"]]);
  });
});

// Y.16. Publish and Reject on the hub decide the approval a run at ready waits
// on; Publish then runs the publish step here, and the driver retries it if it fails.
describe("publish and reject", () => {
  const V = "0123456789ab";

  it("guard first, then refuse a bad id or version before deciding anything", async () => {
    expect(await publishWriterDraft("nope", V)).toMatchObject({ ok: false });
    expect(await publishWriterDraft(ID, "not-a-version")).toEqual({ ok: false, error: "Not a post version." });
    expect(asked).toEqual(["campaigns.marketing", "campaigns.marketing"]);
    expect(approval.calls).toEqual([]);
  });

  it("decides the approval for the version the page showed, then runs the publish step here", async () => {
    runWriterStepNow.mockResolvedValue({ ok: true, campaignId: ID, step: "publish", next: "done", summary: "Published." });
    expect(await publishWriterDraft(ID, V)).toEqual({ ok: true });
    expect(approval.calls).toEqual([["approve", ID, V, { personId: undefined, email: "admin@example.com" }]]);
    expect(runWriterStepNow).toHaveBeenCalledWith(ID);
  });

  it("runs nothing when the approval refuses the click", async () => {
    approval.approve = { ok: false, error: "The post changed since this page loaded." };
    expect(await publishWriterDraft(ID, V)).toEqual({ ok: false, error: "The post changed since this page loaded." });
    expect(runWriterStepNow).not.toHaveBeenCalled();
  });

  it("says when the publish failed after the approval, which the driver retries", async () => {
    runWriterStepNow.mockResolvedValue({ ok: false, campaignId: ID, step: "publish", error: "Publish: slug taken." });
    expect(await publishWriterDraft(ID, V)).toEqual({ ok: false, error: "Approved, but the publish failed: Publish: slug taken." });
  });

  it("reject decides the approval and runs nothing", async () => {
    expect(await rejectWriterDraft(ID)).toEqual({ ok: true });
    expect(approval.calls).toEqual([["reject", ID, { personId: undefined, email: "admin@example.com" }]]);
    expect(runWriterStepNow).not.toHaveBeenCalled();
  });
});
