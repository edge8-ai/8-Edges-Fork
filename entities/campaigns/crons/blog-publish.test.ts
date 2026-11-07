import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Y.20. The daily blog publisher returns the typed run result: a post it could
// not publish and a notice Lark did not take each name themselves, and the
// kernel's outcome rule makes either an error run.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/kernel/config/dates", async (original) => ({
  ...(await original<typeof import("@/kernel/config/dates")>()),
  saigonToday: () => "2026-10-10",
}));
const publishBlogAsset = vi.hoisted(() => vi.fn());
vi.mock("@/entities/campaigns/lib/blog-publish", () => ({ publishBlogAsset }));
// notify() is stubbed; failureOf stays real, so a failed notice fails the step
// as it does in production (Z.7.1). When the router holds the notice is the
// router's own test (kernel/messaging/router.test.ts).
const notified = vi.hoisted(() => ({ accepts: true }));
const notify = vi.hoisted(() =>
  vi.fn(async (_input: { kind: string; to: unknown; message: unknown; dedupeKey: string }) =>
    notified.accepts
      ? { status: "sent" as const }
      : { status: "failed" as const, error: "Lark refused the post: 19021 sign match fail" },
  ),
);
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify,
}));

const { GET } = await import("./blog-publish");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/blog-publish/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const due = (id: string, title: string) => ({ id, title, publish_date: "2026-10-09", brands: { name: "Edge8" } });

beforeEach(() => {
  resetFake();
  notified.accepts = true;
  notify.mockClear();
  publishBlogAsset.mockReset();
});

describe("the blog auto-publish routine", () => {
  it("publishes what is due and keeps its counters", async () => {
    script("marketing_content", { data: [due("a", "Post A")] });
    publishBlogAsset.mockResolvedValue({ ok: true, liveUrl: "https://example.com/a" });
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", checked: 1, published: 1, failed: 0, failures: [] });
  });

  it("tells the Revenue chat through the router as a quiet-hours kind, keyed by the day and the posts it reports", async () => {
    script("marketing_content", { data: [due("a", "Post A")] });
    publishBlogAsset.mockResolvedValue({ ok: true, liveUrl: "https://example.com/a" });
    await run();
    expect(notify).toHaveBeenCalledTimes(1);
    const first = notify.mock.calls[0][0];
    expect(first).toMatchObject({ kind: "revenue.blog-published", to: { chat: "revenue" } });
    expect(String(first.message)).toContain("Post A → https://example.com/a");
    expect(first.dedupeKey).toMatch(/^campaigns:blog-publish:2026-10-10:[0-9a-f]{16}$/);

    // The same posts give the same key, so a retried run is a duplicate; other posts give another.
    resetFake();
    script("marketing_content", { data: [due("a", "Post A")] });
    await run();
    resetFake();
    script("marketing_content", { data: [due("b", "Post B")] });
    await run();
    expect(notify.mock.calls[1][0].dedupeKey).toBe(first.dedupeKey);
    expect(notify.mock.calls[2][0].dedupeKey).not.toBe(first.dedupeKey);
  });

  it("posts nothing when nothing was due", async () => {
    script("marketing_content", { data: [] });
    const { status } = await run();
    expect(status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });

  it("names a post that could not be published and makes the run an error", async () => {
    script("marketing_content", { data: [due("a", "Post A"), due("b", "Post B")] });
    publishBlogAsset.mockResolvedValueOnce({ ok: true, liveUrl: "https://example.com/a" });
    publishBlogAsset.mockResolvedValueOnce({ ok: false, errors: ["Missing meta description."] });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body).toMatchObject({ published: 1, failed: 1 });
    expect(body.error).toBe("Post B (Edge8) at publish: Missing meta description.");
  });

  it("names the chat when Lark does not take the notice", async () => {
    script("marketing_content", { data: [due("a", "Post A")] });
    publishBlogAsset.mockResolvedValue({ ok: true, liveUrl: "https://example.com/a" });
    notified.accepts = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("Marketing chat at notify: Lark refused the post");
  });

  it("stays a plain 500 when the read of due posts fails before any work", async () => {
    script("marketing_content", { error: { message: "db down" } });
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toBe("db down");
  });
});
