import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// R3.352. A blog publish counts as live only once its URL answers 200. The
// flip to published comes first (the sites render only published rows), so a
// publish whose URL has not answered keeps the row's earlier state in
// pre_publish, writes the reason, stamps no posted_url, and says "not live" to
// its caller: the calendar, the Publish Editor, the revenue board, the cron and
// the writer all read that instead of a published post. A Re-publish of a post
// already live at its URL never takes it down, and a retry of a publish still
// waiting keeps the snapshot it took first.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const audits = vi.hoisted(() => [] as { context?: Record<string, unknown> }[]);
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async (a: { context?: Record<string, unknown> }) => void audits.push(a)) }));
vi.mock("./blog", () => ({ BLOG_CACHE_TAG: "blog", postTag: (slug: string) => `post:${slug}` }));

const { publishBlogAsset } = await import("./blog-publish");

const SLUG = "get-consistent-results-from-ai";
const LIVE_URL = `https://ai-officer.com/post/${SLUG}/`;
const words = Array.from({ length: 640 }, (_, i) => `word${i}`).join(" ");
const COPY = `${words} See [one](/post/one/) and [two](/post/two/).\n\n## FAQ\n<details class="faq-item"><summary>Q?</summary>A.</details>`;
// No campaign, so the approval gate does not apply; the ai-officer brand has a
// real https origin, so its URL is checked.
const ROW = {
  id: "blog-1", channel: "blog", title: "Get consistent results", status: "approved", copy_md: COPY,
  seo_md: `slug: ${SLUG}\ntitle tag: Consistent AI results for small teams\nmeta description: How to get the same good answer twice.`,
  image_url: "https://img.example/1.png", publish_date: "2026-11-20", published_at: null, posted_url: null, pre_publish: null,
  brand_id: "brand-aio", campaign_id: null, brands: { name: "AI Officer", slug: "ai-officer" },
};

function post(row: Record<string, unknown>): void {
  // The row, the slug check, the flip, then the write after the check.
  script("marketing_content", { data: row }, { data: null }, { data: null }, { data: null });
}
const updates = () => calls.filter((c) => c.table === "marketing_content" && c.ops.includes("update")).map((c) => c.payloads[0] as Record<string, unknown>);
const answers = (...steps: (number | Error)[]) => {
  const fetch = vi.fn(async () => {
    const step = steps.length > 1 ? steps.shift()! : steps[0];
    if (step instanceof Error) throw step;
    return new Response("", { status: step });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

beforeEach(() => {
  resetFake();
  audits.length = 0;
  // The pauses between attempts run at once.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("publishBlogAsset's live check", () => {
  it("leaves a post whose URL answers 404 not live: snapshot kept, reason written, no posted_url", async () => {
    const fetch = answers(404);
    post(ROW);

    const r = await publishBlogAsset("blog-1", "editor@example.com");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ ok: true, live: false, liveUrl: LIVE_URL });
    if (!r.ok || r.live) throw new Error("expected not live");
    expect(r.reason).toMatch(new RegExp(`^${LIVE_URL} answered 404 at \\d\\d:\\d\\d$`));
    expect(r.liveCheck).toMatchObject({ state: "waiting", reason: r.reason, backTo: "approved" });

    const [flip, after] = updates();
    expect(flip).toMatchObject({
      status: "published",
      posted_url: null,
      live_check_error: null,
      pre_publish: { status: "approved", publish_date: "2026-11-20", published_at: null },
    });
    expect(after).toEqual({ live_check_error: r.reason });
    expect(updates().some((u) => typeof u.posted_url === "string")).toBe(false);
    expect(audits.at(-1)?.context).toMatchObject({ live: false, reason: r.reason });
  });

  it("names a URL that never answers as timing out, not as a status", async () => {
    answers(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    post(ROW);

    const r = await publishBlogAsset("blog-1", "editor@example.com");

    if (!r.ok || r.live) throw new Error("expected not live");
    expect(r.reason).toMatch(/did not answer within 5 seconds at \d\d:\d\d$/);
  });

  it("stamps posted_url and drops the snapshot once the URL answers 200", async () => {
    const fetch = answers(404, 200);
    post(ROW);

    const r = await publishBlogAsset("blog-1", "editor@example.com");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ ok: true, slug: SLUG, liveUrl: LIVE_URL, live: true, checked: true });
    expect(updates()[1]).toEqual({ posted_url: LIVE_URL, pre_publish: null, live_check_error: null });
  });

  it("never takes down a post already live at its URL when a Re-publish's check fails", async () => {
    answers(500);
    post({ ...ROW, status: "published", posted_url: LIVE_URL, published_at: "2026-11-01T02:00:00Z" });

    const r = await publishBlogAsset("blog-1", "editor@example.com");

    expect(r).toMatchObject({ ok: true, live: false, liveCheck: null });
    const [flip, ...rest] = updates();
    expect(flip).toMatchObject({ posted_url: LIVE_URL, pre_publish: null, live_check_error: null });
    expect(rest).toEqual([]);
  });

  it("keeps the first snapshot when a publish still waiting is retried", async () => {
    answers(404);
    const first = { status: "approved", publish_date: null, published_at: null };
    post({ ...ROW, status: "published", publish_date: "2026-11-20", published_at: "2026-11-20T08:17:00Z", pre_publish: first });

    await publishBlogAsset("blog-1", "editor@example.com");

    expect(updates()[0]).toMatchObject({ pre_publish: first });
  });

  it("has nothing to put back for a post published before the check existed", async () => {
    answers(404);
    post({ ...ROW, status: "published", published_at: "2026-11-01T02:00:00Z" });

    const r = await publishBlogAsset("blog-1", "editor@example.com");

    expect(updates()[0]).toMatchObject({ pre_publish: null, posted_url: null });
    expect(r).toMatchObject({ ok: true, live: false, liveCheck: { state: "failed" } });
  });
});
