import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.91, Khoa's decision of 9 Oct 2026: a post live on a campaign that
// publishes on approval keeps the version it was published in. Its title,
// copy, SEO plan, hero image and date are refused, whoever edits them, until
// it is unpublished; the refusal names the way out (unpublish, edit, Ask for
// approval, Publish). The rule is the Publish gate's: the campaign's brand
// decides, an auto-publish brand's switch is its approval (Y.53), a post with
// no campaign or no approval history is not gated, and every failed read
// refuses. A write that leaves the version as it is passes, and so does one
// that puts back the version approved.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("./brand-profiles", async () => (await import("./testing/live-post-fake")).brandProfilesFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("./testing/live-post-fake")).waitingFake);

const { liveEditRefusal, brandChangeRefusal, updateContentUnlessLive, LIVE_EDIT_REFUSAL, BRAND_CHANGE_REFUSAL } = await import("./blog-live-edit");
const { blogVersion } = await import("./blog-version");
const { LIVE_POST, liveGate, resetLiveGate, scriptLivePost } = await import("./testing/live-post-fake");

const versionOf = (r: typeof LIVE_POST) => blogVersion({ title: r.title, copyMd: r.copy_md, bodyHtml: r.body_html, seoMd: r.seo_md, imageUrl: r.image_url, publishDate: r.publish_date });
const approvedLive = () => ({ state: "approved", metadata: { version: versionOf(LIVE_POST) } });
const writes = () => calls.filter((c) => c.ops.some((op) => op === "update" || op === "insert" || op === "upsert"));

beforeEach(() => {
  resetFake();
  resetLiveGate();
});

describe("liveEditRefusal on a live post of a gated campaign", () => {
  it("refuses an edit of each column of the post's version, and names the way out", async () => {
    const edits: Record<string, unknown>[] = [
      { title: "A new title" },
      { copy_md: "Body, edited." },
      { seo_md: "slug: a-new-slug" },
      { image_url: "https://img.example/2.png" },
      { publish_date: "2026-10-20" },
      { body_html: "<p>Body, edited.</p>" },
    ];
    for (const change of edits) {
      liveGate.latest = approvedLive();
      scriptLivePost();
      expect(await liveEditRefusal("blog-1", change)).toBe(LIVE_EDIT_REFUSAL);
    }
    expect(LIVE_EDIT_REFUSAL).toMatch(/unpublish it first \(drag it out of Published on the campaign hub's Workboard tab or on the calendar\)/);
    expect(LIVE_EDIT_REFUSAL).toMatch(/Ask for approval on the campaign hub and Publish/);
  });

  it("refuses while an approval is pending, rejected or withdrawn", async () => {
    for (const state of ["pending", "rejected", "cancelled"]) {
      liveGate.latest = { state, metadata: { version: versionOf({ ...LIVE_POST, copy_md: "Body, edited." }) } };
      scriptLivePost();
      expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBe(LIVE_EDIT_REFUSAL);
    }
  });

  it("refuses any edit asked about before its text is known (before a model call)", async () => {
    liveGate.latest = approvedLive();
    scriptLivePost();
    expect(await liveEditRefusal("blog-1")).toBe(LIVE_EDIT_REFUSAL);
  });

  it("lets a save that leaves the version as it is through: the drawer's every-field save, or only the notes", async () => {
    liveGate.latest = approvedLive();
    scriptLivePost();
    const { title, copy_md, seo_md, image_url, publish_date } = LIVE_POST;
    expect(await liveEditRefusal("blog-1", { title, copy_md, seo_md, image_url, publish_date, notes: "A note." })).toBeNull();
    expect(liveGate.approvalReads).toBe(0);
    // A change of no version column is not even read.
    resetFake();
    expect(await liveEditRefusal("blog-1", { notes: "A note.", blog_style: "thesis" })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("lets an edit that puts back the approved version through, dated or not", async () => {
    // Approved before its first publish dated it; edited live before Y.91.
    liveGate.latest = { state: "approved", metadata: { version: versionOf({ ...LIVE_POST, publish_date: null as unknown as string }) } };
    scriptLivePost({ copy_md: "Body, edited before Y.91." });
    expect(await liveEditRefusal("blog-1", { copy_md: LIVE_POST.copy_md })).toBeNull();
  });

  it("goes by the campaign's brand, and a post moved off it stays locked", async () => {
    liveGate.autoPublishBrands.add("brand-auto");
    liveGate.latest = approvedLive();
    // The row's brand auto-publishes, the campaign's does not: refused.
    scriptLivePost({ brand_id: "brand-auto" }, "brand-1");
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBe(LIVE_EDIT_REFUSAL);
    // The campaign moved onto an auto-publish brand, its post not: still refused,
    // as the gate refuses to publish a post whose brand is not its campaign's.
    scriptLivePost({ brand_id: "brand-1" }, "brand-auto");
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBe(LIVE_EDIT_REFUSAL);
    // Both on the auto-publish brand: through.
    scriptLivePost({ brand_id: "brand-auto" }, "brand-auto");
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
    // A campaign with no brand falls back to the row's.
    scriptLivePost({ brand_id: "brand-auto" }, null);
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
  });
});

// body_html is what ai-officer.com renders, read live through the view
// public.ai_officer_blog_posts, so it is part of a post's version and a
// Publish approval covers it (R3.355).
describe("liveEditRefusal versions body_html", () => {
  const withHtml = (html: string) => ({ ...LIVE_POST, body_html: html });

  it("refuses an HTML body edit even when the rest is exactly the version approved", async () => {
    liveGate.latest = { state: "approved", metadata: { version: versionOf(withHtml("<p>Body.</p>")) } };
    scriptLivePost({ body_html: "<p>Body.</p>" });
    const { title, copy_md, seo_md, image_url, publish_date } = LIVE_POST;
    expect(await liveEditRefusal("blog-1", { title, copy_md, seo_md, image_url, publish_date, body_html: "<p>Body, edited.</p>" })).toBe(LIVE_EDIT_REFUSAL);
  });

  it("refuses clearing an approved HTML body, and putting the Markdown back while changing the HTML", async () => {
    liveGate.latest = { state: "approved", metadata: { version: versionOf(withHtml("<p>Body.</p>")) } };
    scriptLivePost({ body_html: "<p>Body.</p>" });
    expect(await liveEditRefusal("blog-1", { body_html: null })).toBe(LIVE_EDIT_REFUSAL);
    liveGate.latest = approvedLive();
    scriptLivePost({ copy_md: "Body, edited before Y.91.", body_html: "<p>Body.</p>" });
    expect(await liveEditRefusal("blog-1", { copy_md: LIVE_POST.copy_md, body_html: "<p>Other.</p>" })).toBe(LIVE_EDIT_REFUSAL);
  });

  it("lets an edit that puts back the approved HTML body through", async () => {
    liveGate.latest = { state: "approved", metadata: { version: versionOf(withHtml("<p>Approved.</p>")) } };
    scriptLivePost({ body_html: "<p>Edited after approval.</p>" });
    expect(await liveEditRefusal("blog-1", { body_html: "<p>Approved.</p>" })).toBeNull();
    // Approved with no HTML body; the HTML added after it is taken off again.
    liveGate.latest = approvedLive();
    scriptLivePost({ body_html: "<p>Added after approval.</p>" });
    expect(await liveEditRefusal("blog-1", { body_html: null })).toBeNull();
  });

  it("lets a save that keeps the HTML body through, empty and null alike, without reading approvals", async () => {
    liveGate.latest = approvedLive();
    scriptLivePost({ body_html: "<p>Body.</p>" });
    expect(await liveEditRefusal("blog-1", { body_html: "<p>Body.</p>", notes: "A note." })).toBeNull();
    scriptLivePost({ body_html: "" });
    expect(await liveEditRefusal("blog-1", { body_html: null })).toBeNull();
    expect(liveGate.approvalReads).toBe(0);
  });

  it("lets an HTML body edit through where a copy edit goes through: an auto-publish brand, no campaign, no approval history", async () => {
    liveGate.autoPublishBrands.add("brand-1");
    scriptLivePost();
    expect(await liveEditRefusal("blog-1", { body_html: "<p>New.</p>" })).toBeNull();
    liveGate.autoPublishBrands.clear();
    scriptLivePost({ campaign_id: null });
    expect(await liveEditRefusal("blog-1", { body_html: "<p>New.</p>" })).toBeNull();
    scriptLivePost();
    expect(await liveEditRefusal("blog-1", { body_html: "<p>New.</p>" })).toBeNull();
  });
});

describe("liveEditRefusal lets through what the Publish gate does not gate", () => {
  it("an auto-publish brand's live post, without reading its approvals", async () => {
    liveGate.autoPublishBrands.add("brand-1");
    liveGate.latest = approvedLive();
    scriptLivePost();
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
    scriptLivePost();
    expect(await liveEditRefusal("blog-1")).toBeNull();
    expect(liveGate.approvalReads).toBe(0);
  });

  it("a live post with no campaign, without reading the campaign or approvals", async () => {
    liveGate.approvalsFail = true;
    scriptLivePost({ campaign_id: null });
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(["marketing_content"]);
  });

  it("a live post whose campaign has no approval history", async () => {
    scriptLivePost();
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
    expect(liveGate.approvalReads).toBe(1);
  });

  it("a post that is not live, and a row that is not a blog", async () => {
    liveGate.latest = approvedLive();
    for (const status of ["drafted", "approved", "scheduled"]) {
      scriptLivePost({ status });
      expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBeNull();
    }
    scriptLivePost({ channel: "linkedin" });
    expect(await liveEditRefusal("li-1", { copy_md: "Post, edited." })).toBeNull();
    expect(calls.filter((c) => c.table === "marketing_campaigns")).toEqual([]);
    expect(liveGate.approvalReads).toBe(0);
  });
});

describe("liveEditRefusal refuses when it cannot tell", () => {
  it("the post cannot be read", async () => {
    script("marketing_content", { error: { message: "timeout" } });
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toMatch(/The post could not be read, so the edit was not saved.*timeout/);
  });

  it("the campaign cannot be read, or is not found", async () => {
    script("marketing_content", { data: LIVE_POST });
    script("marketing_campaigns", { error: { message: "timeout" } });
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toMatch(/The post's campaign could not be read, so the edit was not saved.*timeout/);
    script("marketing_content", { data: LIVE_POST });
    script("marketing_campaigns", { data: null });
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toBe("The post's campaign was not found, so the edit was not saved.");
  });

  it("the approval cannot be read", async () => {
    liveGate.approvalsFail = true;
    scriptLivePost();
    expect(await liveEditRefusal("blog-1", { copy_md: "Body, edited." })).toMatch(/The Publish approval could not be read, so the edit was not saved.*approvals down/);
  });
});

// The brand decides which site shows a post, so moving a published blog to
// another brand publishes it there and takes it off its own site. No campaign,
// approval or auto-publish switch makes that safe.
describe("brandChangeRefusal", () => {
  it("refuses moving a published blog to another brand, or to none, with or without a campaign", async () => {
    for (const row of [LIVE_POST, { ...LIVE_POST, campaign_id: null }]) {
      script("marketing_content", { data: row });
      expect(await brandChangeRefusal("blog-1", "brand-ai-officer")).toBe(BRAND_CHANGE_REFUSAL);
      script("marketing_content", { data: row });
      expect(await brandChangeRefusal("blog-1", null)).toBe(BRAND_CHANGE_REFUSAL);
    }
    expect(BRAND_CHANGE_REFUSAL).toMatch(/publish it on that brand's site and take it off this one's.*unpublish it first/);
  });

  it("refuses on an auto-publish brand too, without reading the brand or approvals", async () => {
    liveGate.autoPublishBrands.add("brand-1");
    liveGate.autoPublishBrands.add("brand-ai-officer");
    script("marketing_content", { data: LIVE_POST });
    expect(await brandChangeRefusal("blog-1", "brand-ai-officer")).toBe(BRAND_CHANGE_REFUSAL);
    expect(liveGate.approvalReads).toBe(0);
    expect(calls.map((c) => c.table)).toEqual(["marketing_content"]);
  });

  it("lets the same brand through (the drawer's every-field save), and any brand on a row that is not a live blog", async () => {
    script("marketing_content", { data: LIVE_POST });
    expect(await brandChangeRefusal("blog-1", "brand-1")).toBeNull();
    script("marketing_content", { data: { ...LIVE_POST, brand_id: null } });
    expect(await brandChangeRefusal("blog-1", "")).toBeNull();
    for (const row of [{ ...LIVE_POST, status: "drafted" }, { ...LIVE_POST, status: "scheduled" }, { ...LIVE_POST, channel: "linkedin" }]) {
      script("marketing_content", { data: row });
      expect(await brandChangeRefusal("x-1", "brand-ai-officer")).toBeNull();
    }
  });

  it("refuses when the post cannot be read", async () => {
    script("marketing_content", { error: { message: "timeout" } });
    expect(await brandChangeRefusal("blog-1", "brand-ai-officer")).toMatch(/The post could not be read, so the edit was not saved.*timeout/);
  });
});

describe("updateContentUnlessLive", () => {
  it("writes nothing when it refuses a brand move of a published blog, whatever its campaign", async () => {
    script("marketing_content", { data: { ...LIVE_POST, campaign_id: null } });
    expect(await updateContentUnlessLive("blog-1", { brand_id: "brand-ai-officer" })).toEqual({ error: { message: BRAND_CHANGE_REFUSAL, refused: true } });
    expect(writes()).toEqual([]);
  });

  it("writes a brand move of a post that is not live", async () => {
    script("marketing_content", { data: { ...LIVE_POST, status: "drafted" } }, { data: { ...LIVE_POST, status: "drafted" } }, { error: null });
    expect(await updateContentUnlessLive("blog-1", { brand_id: "brand-ai-officer" })).toEqual({ error: null });
    expect(writes().map((c) => c.payloads[0])).toEqual([{ brand_id: "brand-ai-officer" }]);
  });

  it("writes nothing on a refusal, and marks the error as one", async () => {
    liveGate.latest = approvedLive();
    scriptLivePost();
    expect(await updateContentUnlessLive("blog-1", { copy_md: "Body, edited." })).toEqual({ error: { message: LIVE_EDIT_REFUSAL, refused: true } });
    expect(writes()).toEqual([]);
  });

  it("writes what the rule lets through, and hands back the database's error", async () => {
    scriptLivePost({ campaign_id: null });
    script("marketing_content", { error: null });
    expect(await updateContentUnlessLive("blog-1", { copy_md: "Body, edited." })).toEqual({ error: null });
    expect(writes().map((c) => c.payloads[0])).toEqual([{ copy_md: "Body, edited." }]);
    script("marketing_content", { error: { message: "boom" } });
    expect(await updateContentUnlessLive("blog-1", { notes: "A note." })).toEqual({ error: { message: "boom" } });
  });

  it("asks nothing for a row its caller read as not a blog", async () => {
    script("marketing_content", { error: null });
    expect(await updateContentUnlessLive("li-1", { copy_md: "Post." }, "linkedin")).toEqual({ error: null });
    expect(calls.map((c) => c.ops[0])).toEqual(["update"]);
  });
});
