import { beforeEach, describe, expect, it, vi } from "vitest";

// What is the writer's in its run: which states park it and what ops hears
// then. How a run moves on (the tick driver since Y.12) is the shared run
// loop's and is tested once in lib/run-loop.test.ts.

const advance = vi.fn();
vi.mock("./advance", () => ({ advance: (id: string) => advance(id) }));
const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: (t: string) => notify(t) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: () => "https://www.example.com" }));
vi.mock("./data", () => ({
  loadBlogAsset: async () => ({ ok: true, data: { id: "blog-1", postedUrl: "https://www.example.com/post/s/" } }),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: () => undefined }));
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { runWriterStep } = await import("./run-step");

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  process.env.CRON_SECRET = "s3cret";
});

describe("runWriterStep", () => {
  it("returns after a pass and calls nothing over HTTP: the agent driver takes the next step", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "edit", next: "seo", summary: "Edited." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells ops the run is ready to publish", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "validate", next: "ready", summary: "All good." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/ready to publish/));
  });

  it("tells ops the live URL when the run is done", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "channels", next: "done", summary: "Channels drafted." });
    await runWriterStep("c1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/published\. https:\/\/www\.example\.com\/post\/s\//));
  });

  it("tells ops where the run stopped, in step numbers", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "c1", step: "edit", error: "Edit: Contains an em dash." });
    await runWriterStep("c1");
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/stopped at Step 2 of 10: Edit\. Edit: Contains an em dash/));
  });
});
