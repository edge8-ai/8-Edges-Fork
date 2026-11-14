import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeNoticeSupabase, noticeDb, resetNoticeDb } from "./testing/notice-db";

// Z.7: the morning flush. Rows are queued through the real notify(), then
// flushed through the real once() and the real webhook sender over a stubbed
// fetch, so batching, dedupe and the ledger's verdicts are all exercised.

vi.mock("@/kernel/data/supabase", () => fakeNoticeSupabase());
vi.mock("./lark-log", () => ({ logLarkMessage: async () => {} }));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => null }));

const { notify } = await import("./router");
const { flushNotifications } = await import("./notification-flush");
const { runStore } = await import("@/kernel/audit/run-context");

const lark = { answer: { code: 0, msg: "success" } as Record<string, unknown>, posts: [] as { url: string; text: string }[] };

// Wednesday 2026-10-14 at 23:00 and 10:00 Saigon time; the flush runs Thursday at 08:30.
const NIGHT = new Date("2026-10-14T16:00:00Z");
const WORKING = new Date("2026-10-14T03:00:00Z");
const MORNING = new Date("2026-10-15T01:30:05Z");
const LATER = new Date("2026-10-15T02:30:05Z");

const digest = (key: string, chat: "ops" | "revenue", text: string) => notify({ kind: "ops.digest", to: { chat }, message: text, dedupeKey: key }, WORKING);
const held = (key: string, text = "Weekly pulse") => notify({ kind: "revenue.weekly-pulse", to: { chat: "revenue" }, message: text, dedupeKey: key }, NIGHT);

beforeEach(() => {
  resetNoticeDb();
  lark.answer = { code: 0, msg: "success" };
  lark.posts = [];
  vi.stubEnv("LARK_OPS_WEBHOOK_URL", "https://lark.test/hook/ops");
  vi.stubEnv("LARK_MARKETING_WEBHOOK_URL", "https://lark.test/hook/revenue");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      lark.posts.push({ url, text: (JSON.parse(String(init.body)) as { content: { text: string } }).content.text });
      return new Response(JSON.stringify(lark.answer), { status: 200 });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("held notices", () => {
  it("sends a held notice on the working morning, under its own key, and marks the row sent", async () => {
    await held("test:pulse:w42");
    const out = await flushNotifications(MORNING);
    expect(out).toMatchObject({ due: 1, sent: 1, failures: [] });
    expect(lark.posts).toEqual([{ url: "https://lark.test/hook/revenue", text: "Weekly pulse" }]);
    expect(noticeDb.queue[0]).toMatchObject({ status: "sent", carried_by: "test:pulse:w42", attempts: 1 });
    expect(noticeDb.effects.get("test:pulse:w42")?.status).toBe("done");
  });

  it("leaves a row that is not due yet alone", async () => {
    await held("test:pulse:w42");
    expect(await flushNotifications(new Date("2026-10-14T20:00:00Z"))).toMatchObject({ due: 0 });
    expect(lark.posts).toEqual([]);
  });

  it("marks a held row sent without posting again when its key was already sent", async () => {
    await held("test:pulse:w42");
    noticeDb.effects.set("test:pulse:w42", { id: "e0", key: "test:pulse:w42", status: "done", attempt: 1, done_at: "2026-10-14T03:00:00Z", summary: null });
    expect(await flushNotifications(MORNING)).toMatchObject({ sent: 1, failures: [] });
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue[0]).toMatchObject({ status: "sent", sent_at: "2026-10-14T03:00:00Z" });
  });
});

describe("the morning digest", () => {
  it("sends one message per recipient carrying every item queued for it", async () => {
    await digest("test:kr:1", "ops", "KR one moved");
    await digest("test:kr:2", "ops", "KR two moved");
    await digest("test:kr:3", "ops", "KR three moved");
    await digest("test:rev:1", "revenue", "Revenue note");
    const out = await flushNotifications(MORNING);
    expect(out).toMatchObject({ due: 4, digests: 2, failures: [] });
    expect(lark.posts).toHaveLength(2);
    const ops = lark.posts.find((p) => p.url.endsWith("/ops"))!.text;
    expect(ops).toContain("Morning digest for 2026-10-15: 3 notices");
    for (const item of ["KR one moved", "KR two moved", "KR three moved"]) expect(ops).toContain(item);
    expect(noticeDb.effects.get("messaging:digest:ops:2026-10-15")?.status).toBe("done");
    expect(noticeDb.queue.every((r) => r.status === "sent")).toBe(true);
    expect(noticeDb.queue.find((r) => r.dedupe_key === "test:kr:2")).toMatchObject({ carried_by: "messaging:digest:ops:2026-10-15" });
  });

  it("sends nothing twice when the flush runs again", async () => {
    await digest("test:kr:1", "ops", "KR one moved");
    await held("test:pulse:w42");
    await flushNotifications(MORNING);
    expect(await flushNotifications(LATER)).toMatchObject({ due: 0, sent: 0, digests: 0 });
    expect(lark.posts).toHaveLength(2);
  });

  it("moves an item that missed today's digest to tomorrow's, since today's key is spent", async () => {
    await digest("test:kr:1", "ops", "KR one moved");
    await flushNotifications(MORNING);
    // A second item due this morning that the first run did not see.
    await notify({ kind: "ops.digest", to: { chat: "ops" }, message: "Late item", dedupeKey: "test:kr:late" }, new Date("2026-10-14T20:00:00Z"));
    const out = await flushNotifications(LATER);
    expect(out).toMatchObject({ carried: 1, digests: 0 });
    expect(lark.posts).toHaveLength(1);
    expect(noticeDb.queue.find((r) => r.dedupe_key === "test:kr:late")).toMatchObject({ status: "queued", deliver_after: "2026-10-16T01:30:00.000Z" });
  });

  it("reports a digest Lark refused, keeps its rows, and sends it on a later run", async () => {
    await digest("test:kr:1", "ops", "KR one moved");
    lark.answer = { code: 19021, msg: "sign match fail" };
    const failed = await flushNotifications(MORNING);
    expect(failed.failures).toEqual([{ subject: "digest to the ops chat", step: "send the morning digest", error: "code 19021 sign match fail" }]);
    expect(noticeDb.queue[0]).toMatchObject({ status: "queued", attempts: 1, error: "code 19021 sign match fail" });
    lark.answer = { code: 0, msg: "success" };
    expect(await flushNotifications(LATER)).toMatchObject({ digests: 1, failures: [] });
    expect(noticeDb.queue[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("gives a row up as failed after three refusals", async () => {
    await held("test:pulse:w42");
    lark.answer = { code: 9499, msg: "Bad Request" };
    for (const hour of [1, 2, 3]) await flushNotifications(new Date(`2026-10-15T0${hour}:30:05Z`));
    expect(noticeDb.queue[0]).toMatchObject({ status: "failed", attempts: 3 });
  });
});

describe("a flush in shadow", () => {
  it("records each send it would have made and leaves every row queued", async () => {
    await digest("test:kr:1", "ops", "KR one moved");
    await held("test:pulse:w42");
    const out = await runStore().run(
      { routineId: "/api/cron/notification-flush/", runId: null, mode: "shadow", aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] },
      () => flushNotifications(MORNING),
    );
    expect(out).toMatchObject({ due: 2, shadow: 2, sent: 0, digests: 0 });
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue.every((r) => r.status === "queued" && r.attempts === 0)).toBe(true);
    expect(noticeDb.effects.get("shadow:messaging:digest:ops:2026-10-15")?.summary).toBe("Lark digest to the ops chat with 1 notice");
  });
});
