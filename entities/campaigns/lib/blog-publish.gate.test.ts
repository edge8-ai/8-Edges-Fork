import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Opus reviews of #1988. Every publish (the hub, the calendar, the Publish
// Editor, the revenue board, the scheduled-publish cron) goes through
// publishBlogAsset, so the Publish approval is checked there: a writer
// campaign of a brand that publishes on approval, with an approval on record,
// goes live only in a version approved, read off the row as stored. A post
// edited after its approval, a pending, rejected or withdrawn approval, and a
// failed read all refuse before anything is written, and each refusal names
// the control that fixes it. A post with no approval history publishes as
// before; an auto-publish brand's post skips the gate (its switch is its
// approval); a live post counts as its version from before publishing dated it.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/site", () => ({ categories: [] }));
vi.mock("./blog", () => ({ BLOG_CACHE_TAG: "blog", postTag: (slug: string) => `post:${slug}` }));
const brand = vi.hoisted(() => ({ autoPublish: false }));
vi.mock("./brand-profiles", () => ({ getBrandProfile: async () => ({ brandId: "brand-1", autoPublish: brand.autoPublish }) }));
const approvals = vi.hoisted(() => ({ latest: null as null | { state: string; metadata: Record<string, unknown> }, fail: false, reads: 0 }));
vi.mock("@/kernel/approvals/waiting", () => ({
  latestApproval: async () => {
    approvals.reads += 1;
    if (approvals.fail) throw new Error("approvals down");
    return approvals.latest ? { id: "ap-1", decidedBy: null, decidedAt: null, ...approvals.latest } : null;
  },
}));

const { channelChangeRefusal, publishBlogAsset } = await import("./blog-publish");
const { approvedToPublish, blogVersion } = await import("./blog-version");

// A brand with no configured site: a publish that passes the approval gate is
// refused next by the brand check, which proves the gate let it through.
const ROW = {
  id: "blog-1", channel: "blog", title: "How to delegate", status: "scheduled", copy_md: "Body.", seo_md: "slug: how-to-delegate",
  image_url: "https://img.example/1.png", publish_date: "2026-10-13", posted_url: null, brand_id: "brand-1", campaign_id: "c-1",
  brands: { name: "Client Co", slug: "no-such-site" },
};
const versionOf = (r: typeof ROW) => blogVersion({ title: r.title, copyMd: r.copy_md, seoMd: r.seo_md, imageUrl: r.image_url, publishDate: r.publish_date });
const approvedVersion = versionOf(ROW);
// The post's row, then its campaign's brand (the brand that decides the gate).
function post(row: Record<string, unknown>, campaignBrand: string | null = "brand-1"): void {
  script("marketing_content", { data: row });
  if (row.campaign_id) script("marketing_campaigns", { data: { brand_id: campaignBrand } });
}
const PASSED = { ok: false, errors: [expect.stringMatching(/no website configured/)] };
const ASK = { ok: false, errors: [expect.stringMatching(/Press Ask for approval on the campaign hub/)] };

beforeEach(() => {
  resetFake();
  approvals.latest = null;
  approvals.fail = false;
  approvals.reads = 0;
  brand.autoPublish = false;
});

describe("publishBlogAsset's approval gate", () => {
  it("refuses a post edited after its approval, writing nothing, and names Ask for approval", async () => {
    approvals.latest = { state: "approved", metadata: { version: approvedVersion } };
    post({ ...ROW, copy_md: "Body, edited after the approval." });
    expect(await publishBlogAsset("blog-1", "scheduled-publish-cron")).toEqual(ASK);
    expect(calls.filter((c) => c.ops[0] === "update")).toEqual([]);
  });

  it("refuses a rejected or withdrawn approval with Ask for approval, and a pending one with Publish", async () => {
    for (const state of ["rejected", "cancelled"]) {
      approvals.latest = { state, metadata: { version: approvedVersion } };
      post(ROW);
      expect(await publishBlogAsset("blog-1", "calendar")).toEqual(ASK);
    }
    approvals.latest = { state: "pending", metadata: { version: approvedVersion } };
    post(ROW);
    expect(await publishBlogAsset("blog-1", "calendar")).toEqual({ ok: false, errors: [expect.stringMatching(/press Publish on the campaign hub/)] });
  });

  it("refuses when the approval cannot be read", async () => {
    approvals.fail = true;
    post(ROW);
    expect(await publishBlogAsset("blog-1", "publish-editor-agent")).toEqual({ ok: false, errors: [expect.stringMatching(/could not be read/)] });
  });

  it("lets the approved version through, read before the date is defaulted", async () => {
    approvals.latest = { state: "approved", metadata: { version: approvedVersion } };
    post(ROW);
    expect(await publishBlogAsset("blog-1", "scheduled-publish-cron")).toEqual(PASSED);
  });

  // Dead end (c): a post approved with no date was dated by its publish; a
  // Re-publish with no edit is the post approved.
  it("lets an unedited live post be re-published though its first publish dated it", async () => {
    const undated = { ...ROW, publish_date: null as unknown as string };
    approvals.latest = { state: "approved", metadata: { version: versionOf(undated) } };
    post({ ...ROW, status: "published", publish_date: "2026-10-09" });
    expect(await publishBlogAsset("blog-1", "calendar")).toEqual(PASSED);
    // The same dated row that is not live yet is a different version.
    post({ ...ROW, publish_date: "2026-10-09" });
    expect(await publishBlogAsset("blog-1", "calendar")).toEqual(ASK);
  });

  // Dead end (d): an auto-publish brand's switch is its approval.
  it("skips the gate for an auto-publish brand, whatever its approval history", async () => {
    brand.autoPublish = true;
    approvals.latest = { state: "cancelled", metadata: { version: "000000000000" } };
    post(ROW);
    expect(await publishBlogAsset("blog-1", "writer-agent")).toEqual(PASSED);
    expect(approvals.reads).toBe(0);
  });

  it("lets a post with no approval history through, as before", async () => {
    post(ROW);
    expect(await publishBlogAsset("blog-1", "revenue-board")).toEqual(PASSED);
  });

  it("lets a post with no campaign through without reading approvals", async () => {
    approvals.fail = true;
    post({ ...ROW, campaign_id: null });
    expect(await publishBlogAsset("blog-1", "calendar")).toEqual(PASSED);
  });
});

describe("approvedToPublish", () => {
  it("requires an approval when asked to, and names Ask for approval", async () => {
    expect(await approvedToPublish("c-1", approvedVersion)).toEqual({ ok: true });
    expect(await approvedToPublish("c-1", approvedVersion, true)).toEqual({ ok: false, reason: expect.stringMatching(/Ask for approval/) });
  });
});

// The final Opus pass on #1988, finding 1: the campaign's brand decides, and a
// post moved off its campaign's brand never publishes.
describe("the campaign's brand decides the gate", () => {
  it("refuses a client campaign's post moved onto an auto-publish brand, before reading any approval", async () => {
    brand.autoPublish = true;
    post({ ...ROW, brand_id: "self-brand" }, "brand-1");
    expect(await publishBlogAsset("blog-1", "calendar")).toEqual({ ok: false, errors: [expect.stringMatching(/not its campaign's brand/)] });
    expect(approvals.reads).toBe(0);
    expect(calls.filter((c) => c.ops[0] === "update")).toEqual([]);
  });

  it("refuses when the campaign cannot be read", async () => {
    script("marketing_content", { data: ROW });
    script("marketing_campaigns", { error: { message: "db down" } });
    expect(await publishBlogAsset("blog-1", "cron")).toEqual({ ok: false, errors: [expect.stringMatching(/campaign could not be read/)] });
  });
});

describe("channelChangeRefusal", () => {
  it("keeps the channel of a live row and of a campaign's row, and lets a loose draft move", async () => {
    script("marketing_content", { data: { channel: "blog", status: "published", campaign_id: null } });
    expect(await channelChangeRefusal("x", "linkedin")).toMatch(/published entry keeps its channel/);
    script("marketing_content", { data: { channel: "blog", status: "approved", campaign_id: "c-1" } });
    expect(await channelChangeRefusal("x", "linkedin")).toMatch(/belongs to a campaign/);
    script("marketing_content", { data: { channel: "blog", status: "drafted", campaign_id: null } });
    expect(await channelChangeRefusal("x", "linkedin")).toBeNull();
    script("marketing_content", { error: { message: "down" } });
    expect(await channelChangeRefusal("x", "linkedin")).toMatch(/could not be read/);
  });
});
