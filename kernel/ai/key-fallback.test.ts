import Anthropic from "@anthropic-ai/sdk";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { anthropic, resetAnthropicClient } from "@/kernel/ai/client";
import { keyIsSpent, PRIMARY_REST_MS } from "@/kernel/ai/key-fallback";

vi.mock("@/kernel/config/log", () => ({ log: vi.fn() }));

const ok = () =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "hi" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const apiError = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * The real client from kernel/ai/client.ts over a fake fetch, so the
 * middleware runs inside the SDK's own request path and retry loop. `answer`
 * decides each response from the key the request carried; `keys` records that
 * key per HTTP attempt. Only Date is faked, so the SDK's retry sleeps still run.
 */
function harness(answer: (key: string) => Response) {
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("x-api-key") ?? "";
      keys.push(key);
      return answer(key);
    }),
  );
  resetAnthropicClient();
  const call = () =>
    anthropic().messages.create({ model: "claude-haiku-5-5", max_tokens: 16, messages: [{ role: "user", content: "hi" }] });
  return { keys, call };
}

describe("kernel/ai/key-fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    vi.stubEnv("ANTHROPIC_PRIMARY_API_KEY", "primary");
    vi.stubEnv("ANTHROPIC_API_KEY", "fallback");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetAnthropicClient();
  });

  it("uses the primary key while it can pay", async () => {
    const h = harness(() => ok());
    await h.call();
    await h.call();
    expect(h.keys).toEqual(["primary", "primary"]);
  });

  it("re-sends with the fallback key when the primary is out of credit, and the caller sees the answer", async () => {
    const h = harness((key) =>
      key === "primary" ? apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.") : ok(),
    );
    const message = await h.call();
    expect(message.content[0]).toMatchObject({ type: "text", text: "hi" });
    expect(h.keys).toEqual(["primary", "fallback"]);
  });

  it("goes straight to the fallback while the primary rests, then tries the primary again", async () => {
    let primarySpent = true;
    const h = harness((key) => (key === "primary" && primarySpent ? apiError(402, "billing_error", "out of credit") : ok()));
    await h.call();
    vi.setSystemTime(PRIMARY_REST_MS - 1);
    await h.call();
    expect(h.keys).toEqual(["primary", "fallback", "fallback"]);
    primarySpent = false;
    vi.setSystemTime(PRIMARY_REST_MS);
    await h.call();
    expect(h.keys.at(-1)).toBe("primary");
  });

  it("hands over on a revoked primary key (401)", async () => {
    const h = harness((key) => (key === "primary" ? apiError(401, "authentication_error", "invalid x-api-key") : ok()));
    await h.call();
    expect(h.keys).toEqual(["primary", "fallback"]);
  });

  it("keeps a 429 on the primary key: the SDK retries it there", async () => {
    let calls = 0;
    const h = harness(() => (++calls === 1 ? apiError(429, "rate_limit_error", "slow down") : ok()));
    await h.call();
    expect(h.keys).toEqual(["primary", "primary"]);
  });

  it("keeps a 5xx on the primary key", async () => {
    let calls = 0;
    const h = harness(() => (++calls === 1 ? apiError(529, "overloaded_error", "overloaded") : ok()));
    await h.call();
    expect(h.keys).toEqual(["primary", "primary"]);
  });

  it("lets an ordinary bad request fail on the primary key, without trying the fallback", async () => {
    const h = harness(() => apiError(400, "invalid_request_error", "max_tokens: must be positive"));
    await expect(h.call()).rejects.toBeInstanceOf(Anthropic.BadRequestError);
    expect(h.keys).toEqual(["primary"]);
  });

  it("surfaces the fallback's own failure when both keys are spent", async () => {
    const h = harness(() => apiError(402, "billing_error", "out of credit"));
    await expect(h.call()).rejects.toBeInstanceOf(Anthropic.APIError);
    expect(h.keys).toEqual(["primary", "fallback"]);
  });

  it("keyIsSpent reads the body without consuming it", async () => {
    const response = apiError(400, "billing_error", "x");
    expect(await keyIsSpent(response)).toBe(true);
    expect(await response.json()).toMatchObject({ error: { type: "billing_error" } });
    expect(await keyIsSpent(new Response("not json", { status: 400 }))).toBe(false);
    expect(await keyIsSpent(apiError(403, "permission_error", "model not allowed"))).toBe(false);
  });
});
