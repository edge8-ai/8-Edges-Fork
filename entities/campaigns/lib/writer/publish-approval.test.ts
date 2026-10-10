import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalsFor, fake, resetApprovalsFake } from "../testing/approvals-fake";

// Y.16. A writer run at ready waits on a campaign_publish approval addressed to
// the marketing permission's holders, for one version of the post. Publish
// decides that row only when the page, the post and the approval all name the
// same version, then moves the run to its publish step; an edit after the
// approval was asked for withdraws it and asks again; Reject closes the run;
// two decisions at once make one. The approvals primitive is an in-memory fake
// with the primitive's rules (../testing/approvals-fake).

vi.mock("@/kernel/approvals/requests", async () => (await import("../testing/approvals-fake")).requestsFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("../testing/approvals-fake")).waitingFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("../testing/approvals-fake")).parksFake);
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));
vi.mock("@/entities/campaigns/lib/brand-sites", () => ({ siteForBrandSlug: () => ({ domain: "https://client.example", self: false }) }));
vi.mock("@/entities/campaigns/lib/brand-profiles", () => ({
  getBrandProfile: async () => ({ brandId: "brand-1", brandSlug: "client", brandName: "Client Co", autoPublish: false }),
}));

type Blog = { id: string; title: string; copyMd: string | null; seoMd: string | null; imageUrl: string | null; imageBriefMd: string | null; notes: string | null; status: string; postedUrl: string | null; publishDate: string | null };
const store = {
  campaign: { id: "c-1", name: "Launch", idea: "x", objective: null, brandId: "brand-1", pillarId: null, startsOn: null, writerStep: "ready" as string | null, writerStartedAt: "2026-10-09T01:00:00Z" as string | null, writerError: null as string | null, seoGeoMd: null },
  blog: null as unknown as Blog,
  failStateWrite: false,
};
vi.mock("./data", () => ({
  moveWriterStateFrom: async (_id: string, from: string | null, s: { step: string; error: null; startedAt: string }) => {
    if (store.campaign.writerStep !== from) return { ok: true, moved: false };
    Object.assign(store.campaign, { writerStep: s.step, writerError: s.error, writerStartedAt: s.startedAt });
    return { ok: true, moved: true };
  },
  loadCampaign: async () => ({ ok: true, data: { ...store.campaign } }),
  loadBlogAsset: async () => ({ ok: true, data: { ...store.blog } }),
  setWriterState: async (_id: string, s: { step: string | null; error: string | null; startedAt?: string | null }) => {
    if (store.failStateWrite) return { ok: false, error: "write down" };
    store.campaign.writerStep = s.step;
    store.campaign.writerError = s.error;
    if (s.startedAt !== undefined) store.campaign.writerStartedAt = s.startedAt;
    return { ok: true };
  },
}));

const { approvePublish, askToPublish, publishApprovalView, publishGate, reaskPublish, rejectPublish, withdrawPublish, PUBLISH_APPROVER } = await import("./publish-approval");
const { blogVersion } = await import("../blog-version");

const by = { personId: "person-1", email: "approver@example.test" };
const PROFILE = { brandSlug: "client", brandName: "Client Co" };

async function ask(): Promise<string> {
  const asked = await askToPublish(store.campaign, store.campaign.writerStartedAt, PROFILE, store.blog);
  expect(asked.ok).toBe(true);
  return blogVersion(store.blog);
}

beforeEach(() => {
  resetApprovalsFake();
  store.campaign.writerStep = "ready";
  store.campaign.writerError = null;
  store.failStateWrite = false;
  store.blog = { id: "blog-1", title: "How to delegate", copyMd: "Body one.", seoMd: "slug: how-to-delegate", imageUrl: "https://img.example/1.png", imageBriefMd: null, notes: null, status: "drafted", postedUrl: null, publishDate: null };
});

describe("asking to publish", () => {
  it("opens one pending approval for the version, addressed to the publish permission, and parks the run", async () => {
    const version = await ask();
    const rows = approvalsFor("campaign_publish", "c-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "pending", approverPermission: PUBLISH_APPROVER });
    expect(rows[0].metadata).toMatchObject({ version, reach: "public", where: "https://client.example/post/how-to-delegate/", label: 'Publish "How to delegate"' });
    expect(fake.parks).toEqual([expect.objectContaining({ routineId: "/api/cron/writer-agent/", status: "waiting", tick: rows[0].metadata.run })]);
    // Asking twice refreshes the one row rather than adding a second.
    await ask();
    expect(approvalsFor("campaign_publish", "c-1")).toHaveLength(1);
  });

  it("names the version the page needs and the version the post is at", async () => {
    const version = await ask();
    expect(await publishApprovalView("c-1")).toMatchObject({ pendingVersion: version, currentVersion: version, latestState: "pending" });
  });
});

describe("Publish", () => {
  it("approves the version on the page and moves the run to its publish step", async () => {
    const version = await ask();
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: true });
    expect(approvalsFor("campaign_publish", "c-1")[0]).toMatchObject({ state: "approved", decidedBy: "person-1" });
    expect(store.campaign.writerStep).toBe("publish");
    expect(fake.parks[0]).toMatchObject({ status: "ok", summary: "approved by approver@example.test" });
    expect(await publishGate("c-1", store.blog)).toEqual({ ok: true, version });
  });

  it("decides once on a double click or two approvers at once", async () => {
    const version = await ask();
    const [a, b] = await Promise.all([approvePublish("c-1", version, by), approvePublish("c-1", version, { personId: "person-2", email: "b@example.test" })]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(approvalsFor("campaign_publish", "c-1").filter((r) => r.state === "approved")).toHaveLength(1);
    // And a third press after the run moved on is refused, deciding nothing.
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: false, error: "Already approved; the post is being published." });
  });

  it("refuses an approval asked for an older version and asks again for the post as it is", async () => {
    const old = await ask();
    store.blog.copyMd = "Body one, edited after the ask.";
    const now = blogVersion(store.blog);
    const r = await approvePublish("c-1", now, by);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/changed after approval was asked for/) });
    const rows = approvalsFor("campaign_publish", "c-1");
    expect(rows.map((x) => [x.state, x.metadata.version])).toEqual([
      ["cancelled", old],
      ["pending", now],
    ]);
    expect(store.campaign.writerStep).toBe("ready");
    expect(fake.parks.map((p) => p.status)).toEqual(["skipped", "waiting"]);
    // The approver reads it again and publishes the new version.
    expect(await approvePublish("c-1", now, by)).toEqual({ ok: true });
    expect(store.campaign.writerStep).toBe("publish");
  });

  it("refuses a page loaded before an edit, deciding nothing", async () => {
    const old = await ask();
    store.blog.title = "A new title";
    const r = await approvePublish("c-1", old, by);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/changed since this page loaded/) });
    expect(approvalsFor("campaign_publish", "c-1").some((x) => x.state === "approved")).toBe(false);
  });

  it("opens an approval for a run parked before approvals existed, and decides nothing on that click", async () => {
    const version = blogVersion(store.blog);
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/No Publish approval was open/) });
    expect(approvalsFor("campaign_publish", "c-1")).toEqual([expect.objectContaining({ state: "pending" })]);
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: true });
  });

  it("resumes a decision whose state write failed, without deciding again", async () => {
    const version = await ask();
    store.failStateWrite = true;
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/did not move on to publish/) });
    expect(store.campaign.writerStep).toBe("ready");
    store.failStateWrite = false;
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: true });
    expect(store.campaign.writerStep).toBe("publish");
    expect(approvalsFor("campaign_publish", "c-1")).toHaveLength(1);
  });

  it("refuses when the run is not waiting on an approval", async () => {
    store.campaign.writerStep = "edit";
    expect(await approvePublish("c-1", blogVersion(store.blog), by)).toEqual({ ok: false, error: "The writer is not waiting on a Publish approval." });
  });
});

describe("Reject", () => {
  it("decides the approval rejected and closes the run, publishing nothing", async () => {
    await ask();
    expect(await rejectPublish("c-1", by)).toEqual({ ok: true });
    expect(approvalsFor("campaign_publish", "c-1")[0]).toMatchObject({ state: "rejected", decidedBy: "person-1" });
    expect(store.campaign.writerStep).toBe("rejected");
    expect(fake.parks[0]).toMatchObject({ status: "ok", summary: "rejected" });
    // Nothing waits to be published, and a Publish after it is refused.
    expect(await approvePublish("c-1", blogVersion(store.blog), by)).toMatchObject({ ok: false });
  });

  it("decides once: a second Reject finds nothing pending", async () => {
    await ask();
    await rejectPublish("c-1", by);
    store.campaign.writerStep = "ready";
    expect(await rejectPublish("c-1", by)).toEqual({ ok: false, error: expect.stringMatching(/no Publish approval waiting/i) });
  });
});

describe("the publish gate", () => {
  it("refuses with nothing on record, while pending, after a rejection and after an edit", async () => {
    expect(await publishGate("c-1", store.blog)).toMatchObject({ ok: false, reason: expect.stringMatching(/No Publish approval/) });
    const version = await ask();
    expect(await publishGate("c-1", store.blog)).toMatchObject({ ok: false, reason: expect.stringMatching(/pending/) });
    await approvePublish("c-1", version, by);
    store.blog.seoMd = "slug: changed";
    expect(await publishGate("c-1", store.blog)).toEqual({ ok: false, reason: "The post changed after it was approved." });
  });
});

describe("withdrawing on Stop", () => {
  it("withdraws a pending approval and closes the wait", async () => {
    await ask();
    expect(await withdrawPublish("c-1", by, "the run was stopped")).toEqual({ ok: true });
    expect(approvalsFor("campaign_publish", "c-1")[0]).toMatchObject({ state: "cancelled" });
    expect(fake.parks[0]).toMatchObject({ status: "skipped", summary: "the run was stopped" });
  });

  it("leaves a decided approval as it is: a published post stays approved", async () => {
    const version = await ask();
    await approvePublish("c-1", version, by);
    await withdrawPublish("c-1", by, "the writer was started again");
    expect(approvalsFor("campaign_publish", "c-1").map((x) => x.state)).toEqual(["approved"]);
  });
});

// The Opus review of #1988.
describe("the review's writer findings", () => {
  it("6: decides only the row and version checked: a row refreshed to a newer version just after the read stays pending", async () => {
    const version = await ask();
    fake.afterRead = () => {
      approvalsFor("campaign_publish", "c-1")[0].metadata.version = "ffffffffffff";
    };
    expect(await approvePublish("c-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/decided or asked again a moment ago/) });
    expect(approvalsFor("campaign_publish", "c-1")[0].state).toBe("pending");
    expect(store.campaign.writerStep).toBe("ready");
  });

  it("1: a finished run whose scheduled post changed since its approval asks again under a new start time", async () => {
    const version = await ask();
    await approvePublish("c-1", version, by);
    store.campaign.writerStep = "done";
    store.blog.status = "scheduled";
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: false, error: expect.stringMatching(/the version approved/) });
    const epoch = store.campaign.writerStartedAt;
    store.blog.copyMd = "Edited after the approval, before its date.";
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: true });
    expect(store.campaign.writerStep).toBe("ready");
    expect(store.campaign.writerStartedAt).not.toBe(epoch);
    expect(approvalsFor("campaign_publish", "c-1").map((x) => [x.state, x.metadata.version])).toEqual([
      ["approved", version],
      ["pending", blogVersion(store.blog)],
    ]);
    expect(await publishApprovalView("c-1")).toMatchObject({ pendingVersion: blogVersion(store.blog), askable: false });
  });

  it("refuses to ask while the writer runs or already waits, and for a skipped post", async () => {
    store.campaign.writerStep = "ready";
    expect(await reaskPublish("c-1", by)).toEqual({ ok: false, error: expect.stringMatching(/press Publish/) });
    store.campaign.writerStep = "edit";
    expect(await reaskPublish("c-1", by)).toEqual({ ok: false, error: expect.stringMatching(/Stop it first/) });
    store.campaign.writerStep = null;
    store.blog.status = "skipped";
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: false, error: expect.stringMatching(/skipped/) });
  });
});

// The re-review of #1988, blocker 1: no post is left that nothing can publish.
// Every refusal publishBlogAsset gives points at Ask for approval, and Ask for
// approval works whenever the writer is not running.
describe("the way out of every refusal", () => {
  it("(a) a run stopped at ready: its withdrawn approval is askable, and asking reopens it", async () => {
    await ask();
    await withdrawPublish("c-1", by, "the run was stopped");
    store.campaign.writerStep = null;
    expect(await publishApprovalView("c-1")).toMatchObject({ latestState: "cancelled", askable: true });
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: true });
    expect(store.campaign.writerStep).toBe("ready");
    expect(approvalsFor("campaign_publish", "c-1").at(-1)).toMatchObject({ state: "pending", metadata: expect.objectContaining({ version: blogVersion(store.blog) }) });
    expect(await approvePublish("c-1", blogVersion(store.blog), by)).toEqual({ ok: true });
  });

  it("(b) a rejected post can be asked about again and approved", async () => {
    await ask();
    await rejectPublish("c-1", by);
    expect(await publishApprovalView("c-1")).toMatchObject({ askable: true });
    store.blog.copyMd = "Rewritten after the rejection.";
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: true });
    expect(await approvePublish("c-1", blogVersion(store.blog), by)).toEqual({ ok: true });
    expect(store.campaign.writerStep).toBe("publish");
  });

  it("(c) a live post is not askable while it is the version approved, though its publish dated it", async () => {
    const version = await ask();
    await approvePublish("c-1", version, by);
    store.campaign.writerStep = "done";
    Object.assign(store.blog, { status: "published", publishDate: "2026-10-09" });
    // Live on a gated campaign: the hub says edits are refused (Y.91).
    expect(await publishApprovalView("c-1")).toMatchObject({ askable: false, editsLocked: true });
    expect(await reaskPublish("c-1", by)).toEqual({ ok: false, error: expect.stringMatching(/the version approved/) });
    // Edited while live: askable, and asking opens an approval for the live post as it is.
    store.blog.copyMd = "Corrected after it went live.";
    expect(await publishApprovalView("c-1")).toMatchObject({ askable: true });
    expect(await reaskPublish("c-1", by)).toMatchObject({ ok: true });
  });

  // The final Opus pass, finding 3: the move to ready is conditional on the step checked.
  it("does not pull a run started in the meantime back to ready", async () => {
    await ask();
    await rejectPublish("c-1", by);
    fake.afterRead = () => {
      store.campaign.writerStep = "draft";
    };
    expect(await reaskPublish("c-1", by)).toEqual({ ok: false, error: expect.stringMatching(/moved on a moment ago/) });
    expect(store.campaign.writerStep).toBe("draft");
    expect(approvalsFor("campaign_publish", "c-1").map((x) => x.state)).toEqual(["rejected"]);
  });

  it("a brand that publishes without approval is never asked", async () => {
    await ask();
    await rejectPublish("c-1", by);
    expect(await publishApprovalView("c-1", false)).toMatchObject({ askable: false, editsLocked: false });
  });

  it("locks edits only on a live post of a gated campaign with approval history (Y.91)", async () => {
    Object.assign(store.blog, { status: "published" });
    expect(await publishApprovalView("c-1")).toMatchObject({ editsLocked: false });
    await ask();
    expect(await publishApprovalView("c-1")).toMatchObject({ editsLocked: true });
    expect(await publishApprovalView("c-1", false)).toMatchObject({ editsLocked: false });
    Object.assign(store.blog, { status: "approved" });
    expect(await publishApprovalView("c-1")).toMatchObject({ editsLocked: false });
  });
});
