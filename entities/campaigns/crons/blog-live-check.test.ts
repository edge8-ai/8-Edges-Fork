import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveCheckRun } from "@/entities/campaigns/lib/blog-live-check";

// R3.352: the live-check routine tells the Revenue chat only when it put a
// post back, through the router (held to the working window), once per post
// and publish; a notice Lark did not take fails the run by name.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const result = vi.hoisted(() => ({ run: null as LiveCheckRun | null }));
vi.mock("@/entities/campaigns/lib/blog-live-check", () => ({ checkWaitingBlogs: async () => result.run }));
const notified = vi.hoisted(() => ({ accepts: true }));
const notify = vi.hoisted(() =>
  vi.fn(async (_input: { kind: string; to: unknown; message: unknown; dedupeKey: string }) =>
    notified.accepts ? { status: "sent" as const } : { status: "failed" as const, error: "Lark refused the post" },
  ),
);
vi.mock("@/kernel/messaging/router", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/messaging/router")>()),
  notify,
}));

const { GET, schedule } = await import("./blog-live-check");
const { LIVE_CHECK_EVERY_MINUTES } = await import("@/entities/campaigns/lib/blog-live");
const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/blog-live-check/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const empty: LiveCheckRun = { checked: 0, live: [], putBack: [], waiting: 0, older: 0, deferred: 0, failures: [] };
const putBack = {
  id: "a", title: "Get consistent results", backTo: "approved", publishedAt: "2026-11-20T08:17:00.000Z",
  reason: "https://ai-officer.com/post/x/ answered 404 at 15:32",
};

beforeEach(() => {
  notify.mockClear();
  notified.accepts = true;
  result.run = { ...empty };
});

describe("the blog live-check routine", () => {
  it("runs as often as the copy says it does", () => {
    expect(schedule).toBe(`*/${LIVE_CHECK_EVERY_MINUTES} * * * *`);
  });

  it("stays quiet when nothing was put back", async () => {
    result.run = { ...empty, checked: 2, live: [{ id: "b", title: "B", url: "https://ai-officer.com/post/b/" }], waiting: 1 };
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body).toMatchObject({ checked: 2, live: 1, waiting: 1, putBack: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells the Revenue chat which post went back, to what and why, once per publish", async () => {
    result.run = { ...empty, checked: 1, putBack: [putBack] };
    await run();
    const first = notify.mock.calls[0][0];
    expect(first).toMatchObject({ kind: "revenue.blog-put-back", to: { chat: "revenue" } });
    expect(String(first.message)).toContain("Get consistent results → approved: https://ai-officer.com/post/x/ answered 404 at 15:32");
    expect(first.dedupeKey).toMatch(/^campaigns:blog-live-check:[0-9a-f]{16}$/);

    await run();
    result.run = { ...empty, putBack: [{ ...putBack, publishedAt: "2026-11-21T02:00:00.000Z" }] };
    await run();
    expect(notify.mock.calls[1][0].dedupeKey).toBe(first.dedupeKey);
    expect(notify.mock.calls[2][0].dedupeKey).not.toBe(first.dedupeKey);
  });

  it("names the chat when Lark does not take the notice", async () => {
    result.run = { ...empty, putBack: [putBack] };
    notified.accepts = false;
    const { status, body } = await run();
    expect(status).toBe(500);
    expect(body.error).toContain("Marketing chat at notify: Lark refused the post");
  });
});
