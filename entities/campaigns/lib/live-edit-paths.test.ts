import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.91: the lib paths that write a post's version ask the live-edit rule
// before they write, and a refusal leaves everything as it was. The rule's
// own cases are in ./blog-live-edit.test.ts; here each path is driven into
// the real rule: the Publish Editor's update_blog_content tool, the image
// picker and a new image version (which must not move the version history
// either), and the writer's step writes.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/entities/site", () => ({ categories: [] }));
vi.mock("./blog", () => ({ BLOG_CACHE_TAG: "blog", postTag: (slug: string) => `post:${slug}` }));
vi.mock("./brand-profiles", async () => (await import("./testing/live-post-fake")).brandProfilesFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("./testing/live-post-fake")).waitingFake);

const { makePublishEditorTools } = await import("./publish-editor/tools");
const { recordAssetImage, setSelectedImage } = await import("./marketing-images");
const { updateBlogAsset } = await import("./writer/data");
const { blogVersion } = await import("./blog-version");
const { LIVE_POST, liveGate, resetLiveGate, scriptLivePost } = await import("./testing/live-post-fake");

const approved = () => ({
  state: "approved",
  metadata: { version: blogVersion({ title: LIVE_POST.title, copyMd: LIVE_POST.copy_md, seoMd: LIVE_POST.seo_md, imageUrl: LIVE_POST.image_url, publishDate: LIVE_POST.publish_date }) },
});
const writesTo = (table: string) => calls.filter((c) => c.table === table && c.ops.some((op) => op === "update" || op === "insert"));
const LIVE = /This post is live and its campaign publishes on approval/;

beforeEach(() => {
  resetFake();
  resetLiveGate();
});

describe("the Publish Editor's update_blog_content", () => {
  // The tool loads the asset it is bound to before every call.
  const loadAsset = () => script("marketing_content", { data: { ...LIVE_POST, id: "blog-1", posted_url: null, brands: { name: "Client Co", slug: "client" } } });

  it("refuses an edit of a live post on a gated campaign, writing nothing", async () => {
    liveGate.latest = approved();
    loadAsset();
    scriptLivePost();
    const r = await makePublishEditorTools("blog-1", "admin@example.com").exec("update_blog_content", { copyMd: "Body, edited.", reason: "tighten" });
    expect(r).toEqual({ content: expect.stringMatching(LIVE), isError: true });
    expect(writesTo("marketing_content")).toEqual([]);
  });

  it("edits a live post with no campaign, and one of an auto-publish brand, as before", async () => {
    loadAsset();
    scriptLivePost({ campaign_id: null });
    script("marketing_content", { error: null });
    expect(await makePublishEditorTools("blog-1", "a@x").exec("update_blog_content", { seoMd: "slug: new", reason: "r" })).toMatchObject({ chip: "edit content" });
    liveGate.latest = approved();
    liveGate.autoPublishBrands.add("brand-1");
    loadAsset();
    scriptLivePost();
    script("marketing_content", { error: null });
    expect(await makePublishEditorTools("blog-1", "a@x").exec("update_blog_content", { copyMd: "Body, edited.", reason: "r" })).toMatchObject({ chip: "edit content" });
    expect(writesTo("marketing_content").map((c) => c.payloads[0])).toEqual([{ seo_md: "slug: new" }, { copy_md: "Body, edited." }]);
  });

  it("refuses when the approval cannot be read", async () => {
    liveGate.approvalsFail = true;
    loadAsset();
    scriptLivePost();
    expect(await makePublishEditorTools("blog-1", "a@x").exec("update_blog_content", { copyMd: "Body, edited.", reason: "r" })).toEqual({
      content: expect.stringMatching(/The Publish approval could not be read, so the edit was not saved/),
      isError: true,
    });
    expect(writesTo("marketing_content")).toEqual([]);
  });
});

describe("a post's hero image", () => {
  it("a new image version for a live post on a gated campaign is refused before the version history moves", async () => {
    liveGate.latest = approved();
    scriptLivePost();
    expect(await recordAssetImage({ entryId: "blog-1", url: "https://img.example/2.png" })).toEqual({ ok: false, error: expect.stringMatching(LIVE) });
    expect(calls.filter((c) => c.table === "marketing_asset_images")).toEqual([]);
    expect(writesTo("marketing_content")).toEqual([]);
  });

  it("picking another image on a live post of a gated campaign is refused before the selection moves", async () => {
    liveGate.latest = approved();
    script("marketing_asset_images", { data: { url: "https://img.example/2.png" } });
    scriptLivePost();
    expect(await setSelectedImage("blog-1", "img-2")).toEqual({ ok: false, error: expect.stringMatching(LIVE) });
    expect(writesTo("marketing_asset_images")).toEqual([]);
    expect(writesTo("marketing_content")).toEqual([]);
  });

  it("re-picking the image the post already shows changes nothing and passes", async () => {
    liveGate.latest = approved();
    script("marketing_asset_images", { data: { url: LIVE_POST.image_url } }, { error: null }, { error: null });
    scriptLivePost();
    script("marketing_content", { error: null });
    expect(await setSelectedImage("blog-1", "img-1")).toEqual({ ok: true, url: LIVE_POST.image_url });
  });

  it("a new image for a post that is not live is recorded as before", async () => {
    liveGate.latest = approved();
    scriptLivePost({ status: "scheduled" });
    script("marketing_asset_images", { error: null }, { data: { id: "img-2" } });
    script("marketing_content", { error: null });
    expect(await recordAssetImage({ entryId: "blog-1", url: "https://img.example/2.png" })).toEqual({ ok: true });
    expect(writesTo("marketing_content").map((c) => c.payloads[0])).toEqual([{ image_url: "https://img.example/2.png" }]);
  });
});

describe("the writer's step writes", () => {
  it("refuse a live post on a gated campaign, so the step stops on the refusal", async () => {
    liveGate.latest = approved();
    scriptLivePost();
    expect(await updateBlogAsset("blog-1", { copy_md: "Body, rewritten." })).toEqual({ ok: false, error: expect.stringMatching(LIVE) });
    expect(writesTo("marketing_content")).toEqual([]);
  });

  it("write the change log without asking, and a post that is not gated as before", async () => {
    script("marketing_content", { error: null });
    expect(await updateBlogAsset("blog-1", { notes: "## Edit" })).toEqual({ ok: true });
    expect(calls.map((c) => c.ops[0])).toEqual(["update"]);
    liveGate.latest = approved();
    liveGate.autoPublishBrands.add("brand-1");
    scriptLivePost();
    script("marketing_content", { error: null });
    expect(await updateBlogAsset("blog-1", { title: "A new title", seo_md: "slug: new" })).toEqual({ ok: true });
  });
});
