import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.17: inside a shadow run every kernel sender holds back. Each one notes
// what it would have sent on the run's context and answers "not delivered",
// and nothing reaches Lark, Resend, Telegram or an event subscriber. The same
// calls in a live run do reach them, which proves the test would catch a
// sender that forgot to ask. The one send allowed out in shadow goes through
// outsideShadow.

process.env.RESEND_API_KEY = "re_test";
process.env.EMAIL_FROM = "Edge8 <hello@example.test>";
for (const v of ["LARK_OPS_WEBHOOK_URL", "LARK_MARKETING_WEBHOOK_URL", "LARK_COACHING_WEBHOOK_URL", "LARK_PRODUCT_WEBHOOK_URL", "LARK_EO_WEBHOOK_URL"]) {
  process.env[v] = `https://lark.example.test/${v}`;
}
process.env.TELEGRAM_BOT_TOKEN = "t";
process.env.TELEGRAM_CHAT_ID = "c";

const resendSend = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ data: { id: "m1" }, error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send: resendSend }; } }));
// Every Lark API call succeeds; the address lookup finds one open_id.
const larkFetch = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ code: 0, data: { user_list: [{ user_id: "ou_1" }] } }))));
vi.mock("@/kernel/messaging/lark-transport", () => ({
  larkConfigured: () => true,
  larkFetch: (...a: unknown[]) => larkFetch(...a),
  readJson: async (res: Response) => res.json(),
}));
vi.mock("@/kernel/messaging/dm-preference", () => ({ larkDmOptedOut: async () => false }));
vi.mock("@/kernel/messaging/lark-log", () => ({ logLarkMessage: vi.fn(async () => undefined) }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock("@/kernel/events/deliveries", () => ({ recordDelivery: vi.fn(async () => undefined) }));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmail: async () => null }));
vi.mock("@/kernel/identity/company-by-email-domain", () => ({ companyIdForEmailDomain: async () => null }));
vi.mock("@/kernel/data/supabase", () => {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "eq", "in", "limit", "maybeSingle", "single"]) chain[op] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve);
  return { companyOs: { from: () => chain, rpc: async () => ({ data: null, error: null }) } };
});
const webFetch = vi.fn(async (..._a: unknown[]) => new Response(JSON.stringify({ code: 0 })));
vi.stubGlobal("fetch", webFetch);

const { runStore, outsideShadow } = await import("./run-context");
type Ctx = import("./run-context").RunContext;
const { sendTransactionalEmail } = await import("@/kernel/messaging/email");
const lark = await import("@/kernel/messaging/lark");
const { sendLarkDm, sendLarkCard } = await import("@/kernel/messaging/lark-api");
const { sendTelegramMessage } = await import("@/kernel/messaging/telegram");
const { publish, subscribe, resetSubscribers } = await import("@/kernel/events/bus");

function context(mode: "live" | "shadow"): Ctx {
  return { routineId: "/api/cron/chain/", runId: "run-1", mode, aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] };
}

// Every sender, once, with what it answered.
async function sendEverything(): Promise<unknown[]> {
  const handler = vi.fn(async () => undefined);
  resetSubscribers();
  subscribe("boards", "board.card.completed", handler);
  const out: unknown[] = [
    await sendTransactionalEmail({ to: ["a@example.test", "b@example.test"], subject: "Your follow-up", html: "<p>hi</p>" }),
    await lark.notifyOps("ops notice"),
    await lark.notifyMarketing({ card: { header: {} } }),
    await lark.sendLarkMessage("coaching notice"),
    await lark.notifyProduct("product notice"),
    await lark.notifyEo("eo notice"),
    await sendLarkDm("ana@example.test", "a DM", { category: "workboard" }),
    await sendLarkCard("ana@example.test", { header: {} }),
    await sendTelegramMessage("telegram notice"),
    await publish("board.card.completed", { taskId: "t1", boardSlug: "b", subjectType: null, subjectId: null }),
  ];
  out.push(handler.mock.calls.length);
  return out;
}

beforeEach(() => {
  resendSend.mockClear();
  larkFetch.mockClear();
  webFetch.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("the kernel's senders in a shadow run (Z.17)", () => {
  it("send nothing, answer not delivered, and note each one on the run", async () => {
    const ctx = context("shadow");
    const out = await runStore().run(ctx, sendEverything);
    expect(resendSend).not.toHaveBeenCalled();
    expect(larkFetch).not.toHaveBeenCalled();
    expect(webFetch).not.toHaveBeenCalled();
    // Email, five webhooks, DM, card: false. Telegram and publish: nothing. No subscriber ran.
    expect(out).toEqual([false, false, false, false, false, false, false, false, undefined, undefined, 0]);
    expect(ctx.withheld.map((w) => w.channel)).toEqual(["email", "lark", "lark", "lark", "lark", "lark", "lark-dm", "lark-card", "telegram", "event"]);
    expect(ctx.withheld[0].what).toBe("a transactional email to 2 recipients");
    expect(ctx.withheld[1].what).toBe("a text post to the ops chat (other)");
    expect(ctx.withheld[9].what).toBe("board.card.completed");
    // No address, subject or body is kept.
    expect(JSON.stringify(ctx.withheld)).not.toMatch(/example\.test|follow-up|ops notice|a DM/);
  });

  it("send as before in a live run, which is what proves each one asks", async () => {
    const ctx = context("live");
    const out = await runStore().run(ctx, sendEverything);
    expect(resendSend).toHaveBeenCalledOnce();
    expect(webFetch).toHaveBeenCalledTimes(6); // five webhooks and Telegram
    // The DM and the card (the other calls look the person up in the directory).
    expect(larkFetch.mock.calls.filter(([path]) => String(path).startsWith("/open-apis/im/v1/messages"))).toHaveLength(2);
    expect(out.at(-1)).toBe(1); // the subscriber ran
    expect(ctx.withheld).toEqual([]);
  });

  it("let a send through outsideShadow, the explicit allowlist, and only that one", async () => {
    const ctx = context("shadow");
    await runStore().run(ctx, async () => {
      expect(await outsideShadow("the alert about the run's own repeated failure", () => lark.notifyOps("routine failing"))).toBe(true);
      expect(await lark.notifyOps("an ordinary notice")).toBe(false);
    });
    expect(webFetch).toHaveBeenCalledOnce();
    expect(ctx.withheld.map((w) => w.channel)).toEqual(["lark"]);
  });
});
