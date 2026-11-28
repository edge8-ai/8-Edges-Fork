import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// R3.352: the five-minute re-check behind every blog publish whose URL has not
// answered yet. A 200 stamps posted_url; no answer once the grace window is
// over puts the post back to the state kept before the publish; a post with no
// snapshot is only marked not live. Every write is guarded on the row still
// being the publish the run read, so a person's move or re-publish in between wins.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }));
const audits = vi.hoisted(() => [] as { actor: string; context?: Record<string, unknown> }[]);
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async (a: { actor: string; context?: Record<string, unknown> }) => void audits.push(a)) }));
vi.mock("./blog", () => ({ BLOG_CACHE_TAG: "blog", postTag: (slug: string) => `post:${slug}` }));

const { checkWaitingBlogs } = await import("./blog-live-check");

const NOW = new Date("2026-11-20T08:40:00.000Z"); // 15:40 in Saigon
const before = { status: "approved", publish_date: "2026-11-21", published_at: null };
const row = (id: string, more: Record<string, unknown> = {}) => ({
  id, title: `Post ${id}`, slug: `post-${id}`, status: "published", published_at: "2026-11-20T08:35:00.000Z",
  pre_publish: before, live_check_error: null, brand_id: "brand-aio", ...more,
});
const urlOf = (id: string) => `https://ai-officer.com/post/post-${id}/`;
const LATE = "2026-11-20T08:17:00.000Z"; // 23 minutes before NOW: the grace is over
const HOUR_START = new Date("2026-11-20T09:02:00.000Z"); // 16:02 in Saigon: the hour's first run

function sites(status: Record<string, number>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response("", { status: status[url] ?? 404 })));
}
const writes = () => calls.filter((c) => c.table === "marketing_content" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  audits.length = 0;
  // The brand's slug, read once per run through the contacts door.
  script("brands", { data: { slug: "ai-officer" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("checkWaitingBlogs", () => {
  it("stamps a post live once its URL answers, guarded on it still waiting", async () => {
    sites({ [urlOf("a")]: 200 });
    script("marketing_content", { data: [row("a")] }, { data: [{ id: "a" }] });

    const run = await checkWaitingBlogs(NOW);

    expect(run).toMatchObject({ checked: 1, live: [{ id: "a", url: urlOf("a") }], putBack: [], failures: [] });
    const [stamp] = writes();
    expect(stamp.payloads[0]).toEqual({ posted_url: urlOf("a"), pre_publish: null, live_check_error: null });
    expect(stamp.filters).toContainEqual(["eq", "status", "published"]);
    expect(stamp.filters).toContainEqual(["is", "posted_url", null]);
    expect(audits).toEqual([expect.objectContaining({ actor: "blog-live-check", context: expect.objectContaining({ live: true }) })]);
  });

  it("keeps waiting inside the grace window, writing only the reason", async () => {
    sites({});
    script("marketing_content", { data: [row("a")] }, { data: [{ id: "a" }] });

    const run = await checkWaitingBlogs(NOW);

    expect(run).toMatchObject({ checked: 1, waiting: 1, putBack: [], live: [] });
    expect(writes().map((c) => c.payloads[0])).toEqual([{ live_check_error: `${urlOf("a")} answered 404 at 15:40` }]);
  });

  it("puts a post back to its earlier state once the grace window is over", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { published_at: LATE })] }, { data: [{ id: "a" }] });

    const run = await checkWaitingBlogs(NOW);

    const reason = `${urlOf("a")} answered 404 at 15:40`;
    expect(run.putBack).toEqual([{ id: "a", title: "Post a", backTo: "approved", reason, publishedAt: LATE }]);
    expect(writes()[0].payloads[0]).toEqual({ status: "approved", publish_date: "2026-11-21", published_at: null, pre_publish: null, live_check_error: reason });
    expect(audits[0].context).toMatchObject({ live: false, put_back_to: "approved", reason });
  });

  it("only marks not live a post with nothing to go back to, however late, asking it in the hour's first run", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { published_at: LATE, pre_publish: null })] }, { data: [{ id: "a" }] });

    const run = await checkWaitingBlogs(HOUR_START);

    expect(run).toMatchObject({ older: 1, putBack: [] });
    expect(writes().map((c) => c.payloads[0])).toEqual([{ live_check_error: `${urlOf("a")} answered 404 at 16:02` }]);
  });

  it("leaves a post with nothing to go back to for the hour's first run", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { published_at: LATE, pre_publish: null })] });

    const run = await checkWaitingBlogs(NOW);

    expect(run).toMatchObject({ checked: 0, older: 0 });
    expect(writes()).toEqual([]);
  });

  it("asks at most 30 URLs a run, posts with a snapshot first, and counts the rest as deferred", async () => {
    sites({});
    const rows = [row("old", { pre_publish: null }), ...Array.from({ length: 31 }, (_, i) => row(`w${i}`, { published_at: "2026-11-20T08:55:00.000Z", live_check_error: `${urlOf(`w${i}`)} answered 404 at 16:00` }))];
    script("marketing_content", { data: rows });

    const run = await checkWaitingBlogs(HOUR_START);

    expect(run).toMatchObject({ checked: 30, waiting: 30, older: 0, deferred: 2 });
  });

  it("leaves a post a person moved meanwhile: the guarded write matches nothing and nothing is told", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { published_at: LATE })] }, { data: [] });

    const run = await checkWaitingBlogs(NOW);

    expect(run.putBack).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("guards every write on the publish it read, so a re-publish meanwhile (a new published_at) is never put back", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { published_at: LATE })] }, { data: [] });

    const run = await checkWaitingBlogs(NOW);

    expect(writes()[0].filters).toContainEqual(["eq", "published_at", LATE]);
    expect(run.putBack).toEqual([]);
  });

  it("puts a post that was Scheduled back to Approved, so the scheduled-publish cron does not publish it again", async () => {
    sites({});
    const scheduled = { status: "scheduled", publish_date: "2026-11-20", published_at: null };
    script("marketing_content", { data: [row("a", { published_at: LATE, pre_publish: scheduled })] }, { data: [{ id: "a" }] });

    const run = await checkWaitingBlogs(NOW);

    expect(run.putBack).toMatchObject([{ id: "a", backTo: "approved" }]);
    expect(writes()[0].payloads[0]).toMatchObject({ status: "approved", publish_date: "2026-11-20" });
  });

  it("does not rewrite a reason whose answer has not changed", async () => {
    sites({});
    script("marketing_content", { data: [row("a", { live_check_error: `${urlOf("a")} answered 404 at 15:35` })] });

    const run = await checkWaitingBlogs(NOW);

    expect(run).toMatchObject({ checked: 1, waiting: 1 });
    expect(writes()).toEqual([]);
  });

  it("names a row whose write failed and still checks the others", async () => {
    sites({ [urlOf("b")]: 200 });
    script("marketing_content", { data: [row("a"), row("b")] }, { error: { message: "db down" } }, { data: [{ id: "b" }] });

    const run = await checkWaitingBlogs(NOW);

    expect(run.failures).toEqual([{ subject: "Post a", step: "live check", error: expect.stringContaining("db down") }]);
    expect(run.live.map((l) => l.id)).toEqual(["b"]);
  });

  it("names the posts whose brand could not be read, asking no URL for them", async () => {
    resetFake();
    script("brands", { error: { message: "brands down" } });
    sites({});
    script("marketing_content", { data: [row("a")] });

    const run = await checkWaitingBlogs(NOW);

    expect(run.checked).toBe(0);
    expect(run.failures).toEqual([{ subject: "Post a", step: "live check", error: expect.stringContaining("brands down") }]);
  });

  it("raises a failed read rather than reporting nothing waiting", async () => {
    script("marketing_content", { error: { message: "db down" } });
    await expect(checkWaitingBlogs(NOW)).rejects.toThrow(/db down/);
  });
});
