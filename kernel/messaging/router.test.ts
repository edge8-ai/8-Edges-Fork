import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeNoticeSupabase, noticeDb, resetNoticeDb } from "./testing/notice-db";

// Z.7: the notification router. The real once() runs over an in-memory ledger
// and queue, and the real Lark webhook sender runs over a stubbed fetch, so a
// Lark rejection (HTTP 200 with a non-zero code) is exercised end to end.

vi.mock("@/kernel/data/supabase", () => fakeNoticeSupabase());
vi.mock("./lark-log", () => ({ logLarkMessage: async () => {} }));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => "person-1" }));
const optedOut = vi.hoisted(() => ({ value: false }));
vi.mock("./dm-preference", () => ({ larkDmOptedOut: async () => optedOut.value }));

const { notify, failureOf } = await import("./router");
const { runStore } = await import("@/kernel/audit/run-context");

const lark = { answer: { code: 0, msg: "success" } as Record<string, unknown>, posts: [] as string[] };

// Wednesday 2026-10-14: 10:00 and 23:00 Saigon time; Saturday 2026-10-17 at noon.
const WORKING = new Date("2026-10-14T03:00:00Z");
const NIGHT = new Date("2026-10-14T16:00:00Z");
const SATURDAY = new Date("2026-10-17T05:00:00Z");

const alert = (dedupeKey = "test:alert:1") => ({ kind: "ops.alert" as const, to: { chat: "ops" as const }, message: "Sync failed", dedupeKey });
const pulse = (dedupeKey = "test:pulse:1") => ({ kind: "revenue.weekly-pulse" as const, to: { chat: "revenue" as const }, message: "Weekly pulse", dedupeKey });
const digestItem = (dedupeKey = "test:digest:1") => ({ kind: "ops.digest" as const, to: { chat: "ops" as const }, message: "Key results updated", dedupeKey });

function inShadow<T>(fn: () => Promise<T>): Promise<T> {
  return runStore().run(
    { routineId: "/api/cron/test/", runId: null, mode: "shadow", aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] },
    fn,
  );
}

beforeEach(() => {
  resetNoticeDb();
  optedOut.value = false;
  lark.answer = { code: 0, msg: "success" };
  lark.posts = [];
  vi.stubEnv("LARK_OPS_WEBHOOK_URL", "https://lark.test/hook/ops");
  vi.stubEnv("LARK_MARKETING_WEBHOOK_URL", "https://lark.test/hook/revenue");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      lark.posts.push(String(init.body));
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

describe("quiet hours", () => {
  it("sends an immediate notice now inside working hours, and marks its key done", async () => {
    expect(await notify(pulse(), WORKING)).toEqual({ status: "sent" });
    expect(lark.posts).toHaveLength(1);
    expect(noticeDb.effects.get("test:pulse:1")?.status).toBe("done");
    expect(noticeDb.queue).toEqual([]);
  });

  it("holds a non-urgent immediate notice at night until 08:30 the next working morning, sending nothing", async () => {
    expect(await notify(pulse(), NIGHT)).toEqual({ status: "held", until: "2026-10-15T01:30:00.000Z" });
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue).toEqual([
      expect.objectContaining({ kind: "revenue.weekly-pulse", channel: "lark_chat", recipient: "revenue", reason: "held", status: "queued", deliver_after: "2026-10-15T01:30:00.000Z", message: { text: "Weekly pulse" } }),
    ]);
    expect(noticeDb.effects.size).toBe(0);
  });

  it("holds a weekend notice until Monday morning", async () => {
    expect(await notify(pulse(), SATURDAY)).toEqual({ status: "held", until: "2026-10-19T01:30:00.000Z" });
  });

  it("sends an urgent notice at once, at night and at the weekend alike", async () => {
    expect(await notify(alert("test:alert:night"), NIGHT)).toEqual({ status: "sent" });
    expect(await notify(alert("test:alert:sat"), SATURDAY)).toEqual({ status: "sent" });
    // A normally held kind raised to urgent by its caller goes too.
    expect(await notify({ ...pulse("test:pulse:urgent"), urgency: "urgent" }, NIGHT)).toEqual({ status: "sent" });
    expect(lark.posts).toHaveLength(3);
    expect(noticeDb.queue).toEqual([]);
  });

  it("sends now rather than lose a notice when the queue cannot be written", async () => {
    noticeDb.queueWriteError = "connection refused";
    expect(await notify(pulse(), NIGHT)).toEqual({ status: "sent" });
    expect(lark.posts).toHaveLength(1);
  });
});

// Z.7.1: the three Revenue chat senders that used to post outside working
// hours, at the minutes their crons actually run.
describe("the Revenue chat senders wait for working hours", () => {
  const revenue = (kind: "revenue.closed-cards" | "revenue.marketing-digest" | "revenue.blog-published", dedupeKey: string) => ({
    kind,
    to: { chat: "revenue" as const },
    message: `A ${kind} notice`,
    dedupeKey,
  });
  // The crons' own minutes, Saigon time: closed cards at 18:00, the digest at 09:00, the blog notice at 11:00.
  const WED_1800 = new Date("2026-10-14T11:00:00Z");
  const FRI_1800 = new Date("2026-10-16T11:00:00Z");
  const SAT_0900 = new Date("2026-10-17T02:00:00Z");
  const SUN_1100 = new Date("2026-10-18T04:00:00Z");
  const WED_1000 = WORKING;
  const MON_0830 = "2026-10-19T01:30:00.000Z";

  it("holds the 18:00 closed-cards post to 08:30 the next working day", async () => {
    expect(await notify(revenue("revenue.closed-cards", "test:closed:wed"), WED_1800)).toEqual({ status: "held", until: "2026-10-15T01:30:00.000Z" });
    // Friday's waits over the weekend for Monday.
    expect(await notify(revenue("revenue.closed-cards", "test:closed:fri"), FRI_1800)).toEqual({ status: "held", until: MON_0830 });
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue.map((r) => r.reason)).toEqual(["held", "held"]);
  });

  it("holds a Saturday digest, and a Sunday blog notice, to Monday 08:30", async () => {
    expect(await notify(revenue("revenue.marketing-digest", "test:digest:sat"), SAT_0900)).toEqual({ status: "held", until: MON_0830 });
    expect(await notify(revenue("revenue.blog-published", "test:blog:sun"), SUN_1100)).toEqual({ status: "held", until: MON_0830 });
    expect(lark.posts).toEqual([]);
  });

  it("sends each one at once at 10:00 on a weekday", async () => {
    for (const kind of ["revenue.closed-cards", "revenue.marketing-digest", "revenue.blog-published"] as const) {
      expect(await notify(revenue(kind, `test:${kind}:now`), WED_1000)).toEqual({ status: "sent" });
    }
    expect(lark.posts).toHaveLength(3);
    expect(noticeDb.queue).toEqual([]);
  });

  it("holds a repeat of the same key once, so a second run queues nothing more", async () => {
    await notify(revenue("revenue.marketing-digest", "test:digest:sat"), SAT_0900);
    expect(await notify(revenue("revenue.marketing-digest", "test:digest:sat"), SAT_0900)).toMatchObject({ status: "duplicate" });
    expect(noticeDb.queue).toHaveLength(1);
  });

  it("fails the step when the Revenue chat refuses a post sent in working hours", async () => {
    lark.answer = { code: 19021, msg: "sign match fail" };
    const result = await notify(revenue("revenue.blog-published", "test:blog:refused"), WED_1000);
    expect(failureOf(result, "Marketing chat", "notify")).toEqual([{ subject: "Marketing chat", step: "notify", error: "code 19021 sign match fail" }]);
  });
});

describe("digest kinds", () => {
  it("queues a digest kind for the next working morning even inside working hours", async () => {
    expect(await notify(digestItem(), WORKING)).toEqual({ status: "queued", until: "2026-10-15T01:30:00.000Z" });
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue[0]).toMatchObject({ reason: "digest", recipient: "ops" });
  });

  it("queues a notice once however often it is raised", async () => {
    await notify(digestItem(), WORKING);
    expect(await notify(digestItem(), WORKING)).toMatchObject({ status: "duplicate" });
    expect(noticeDb.queue).toHaveLength(1);
  });

  it("files a direct message under the lowercased address and its person", async () => {
    await notify({ kind: "ops.digest", to: { person: "Someone@Example.test" }, message: "Hello", dedupeKey: "test:dm:1" }, WORKING);
    expect(noticeDb.queue[0]).toMatchObject({ channel: "lark_dm", recipient: "someone@example.test", person_id: "person-1" });
  });
});

describe("dedupe through the effect ledger", () => {
  it("never sends twice for one key, whether retried or repeated", async () => {
    await notify(alert(), WORKING);
    expect(await notify(alert(), WORKING)).toMatchObject({ status: "duplicate" });
    expect(lark.posts).toHaveLength(1);
  });

  it("lets a retry send after a refusal, because a refused send releases its key", async () => {
    lark.answer = { code: 19021, msg: "sign match fail" };
    expect(await notify(alert(), WORKING)).toMatchObject({ status: "failed" });
    expect(noticeDb.effects.get("test:alert:1")?.status).toBe("released");
    lark.answer = { code: 0, msg: "success" };
    expect(await notify(alert(), WORKING)).toEqual({ status: "sent" });
    expect(lark.posts).toHaveLength(2);
  });

  it("refuses a missing key or one in the shadow namespace before anything is sent", async () => {
    expect(await notify(alert(""), WORKING)).toMatchObject({ status: "failed" });
    expect(await notify(alert("shadow:x"), WORKING)).toMatchObject({ status: "failed" });
    expect(lark.posts).toEqual([]);
  });
});

describe("a failed Lark send fails its step", () => {
  it("treats HTTP 200 with a non-zero code as a failure the step reports", async () => {
    lark.answer = { code: 19024, msg: "Key Words Not Found" };
    const result = await notify(alert(), WORKING);
    expect(result).toEqual({ status: "failed", error: "code 19024 Key Words Not Found" });
    expect(failureOf(result, "edge8", "warn Operations")).toEqual([{ subject: "edge8", step: "warn Operations", error: "code 19024 Key Words Not Found" }]);
  });

  it("treats an unset webhook as a failure too, so a silent chat is never a green run", async () => {
    vi.stubEnv("LARK_OPS_WEBHOOK_URL", "");
    expect(await notify(alert(), WORKING)).toEqual({ status: "failed", error: "LARK_OPS_WEBHOOK_URL is not set" });
  });

  it("reports nothing for a person who opted out of Lark DMs: they asked not to hear", async () => {
    vi.stubEnv("LARK_APP_ID", "app");
    vi.stubEnv("LARK_APP_SECRET", "secret");
    optedOut.value = true;
    const result = await notify({ kind: "ops.alert", to: { person: "someone@example.test" }, message: "Hello", dedupeKey: "test:dm:2" }, WORKING);
    expect(result).toEqual({ status: "declined", reason: "the recipient opted out of Lark DMs" });
    expect(failureOf(result, "someone", "tell them")).toEqual([]);
    expect(lark.posts).toEqual([]);
  });
});

describe("shadow runs", () => {
  it("records what would have been sent, and neither sends nor queues", async () => {
    const sent = await inShadow(() => notify(alert(), WORKING));
    const held = await inShadow(() => notify(pulse(), NIGHT));
    const queued = await inShadow(() => notify(digestItem(), WORKING));
    for (const r of [sent, held, queued]) expect(r.status).toBe("shadow");
    expect(lark.posts).toEqual([]);
    expect(noticeDb.queue).toEqual([]);
    expect(noticeDb.effects.get("shadow:test:alert:1")?.summary).toBe("Lark ops.alert notice to the ops chat, sent now: Sync failed");
    expect(noticeDb.effects.get("shadow:test:pulse:1")?.summary).toContain("held until 2026-10-15T01:30:00.000Z");
    expect(noticeDb.effects.get("shadow:test:digest:1")?.summary).toContain("queued for the morning digest");
    // The live key is untouched, so the first live run still sends.
    expect(noticeDb.effects.has("test:alert:1")).toBe(false);
  });

  it("never names a person's address in a shadow record", async () => {
    await inShadow(() => notify({ kind: "ops.alert", to: { person: "someone@example.test" }, message: "Hello", dedupeKey: "test:dm:3" }, WORKING));
    expect(noticeDb.effects.get("shadow:test:dm:3")?.summary).toBe("Lark ops.alert notice to a person (Lark DM), sent now: Hello");
  });
});
