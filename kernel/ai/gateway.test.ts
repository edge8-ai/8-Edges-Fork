import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMessage } from "@/kernel/ai/testing/fake-message";

// The two SDK clients and the database are the gateway's outside world; each
// is replaced by a recording double. Everything between them (model
// resolution, the class check, the ledger row) runs for real.
const { anthropicCreate, anthropicStream, openRouterCreate, inserts, insertError, anthropicKey, fallbacks } = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  anthropicStream: vi.fn(),
  openRouterCreate: vi.fn(),
  inserts: [] as Record<string, unknown>[],
  insertError: { current: null as { message: string } | null },
  anthropicKey: { set: true },
  // Fallbacks a test declares for a site of its own, over the real SITE_MODELS.
  fallbacks: new Map<string, { model: string; afterMs: number }>(),
}));

vi.mock("@/kernel/ai/client", () => {
  const anthropicClient = { messages: { create: anthropicCreate, stream: anthropicStream } };
  const openRouterClient = { messages: { create: openRouterCreate, stream: vi.fn() } };
  return {
    anthropic: () => anthropicClient,
    anthropicIfConfigured: () => (anthropicKey.set ? anthropicClient : null),
    openRouter: () => openRouterClient,
    openRouterIfConfigured: () => openRouterClient,
  };
});

// The registry is real; a test may add a fallback for a site of its own.
vi.mock("@/kernel/ai/models", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/kernel/ai/models")>();
  return { ...actual, fallbackFor: (site: string, model: string) => fallbacks.get(site) ?? actual.fallbackFor(site, model) };
});

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: insertError.current };
      },
    }),
  },
}));

import { AiPromptRefused, aiSite, otherProviderCall, type PromptTag } from "@/kernel/ai/gateway";
import { definePrompt } from "@/kernel/ai/prompts";
import { AiRouteRefused } from "@/kernel/ai/routing";

const HELLO_HASH = "e920b204bce6401c9e1a506f434853899fabada37ae5ad9033d8937eda0ba853";

/** A prompt for `site`, as the site's .prompt.ts would declare it. */
const promptFor = (site: string) => definePrompt(site, { system: "You screen resumes." });

/** A request as a site sends it: the SDK body plus the prompt it names. */
function request(model: string, site: string): Anthropic.MessageCreateParamsNonStreaming & PromptTag {
  return { prompt: promptFor(site), model, max_tokens: 100, system: "You screen resumes.", messages: [{ role: "user", content: "hello" }] };
}

/** What reaches the SDK: the gateway strips the prompt before the request leaves. */
function sent(body: Anthropic.MessageCreateParamsNonStreaming & PromptTag): Anthropic.MessageCreateParamsNonStreaming {
  const { prompt: _prompt, ...rest } = body;
  return rest;
}

beforeEach(() => {
  anthropicCreate.mockReset();
  anthropicStream.mockReset();
  openRouterCreate.mockReset();
  inserts.length = 0;
  insertError.current = null;
  anthropicKey.set = true;
  fallbacks.clear();
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the class check", () => {
  it("a class S site configured with a non-Claude model throws before any network call", async () => {
    vi.stubEnv("AI_MODEL_RESUME_SCREEN", "deepseek/deepseek-v4-pro");
    const ai = aiSite({ site: "resume-screen", dataClass: "S", tier: "standard" });
    expect(ai.model).toBe("deepseek/deepseek-v4-pro");
    const client = ai.clientIfConfigured();
    await expect(client!.messages.create(request(ai.model, ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openRouterCreate).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("an undeclared site is treated as S", async () => {
    vi.stubEnv("AI_MODEL_NEW_THING", "qwen/qwen3.8-flash");
    const ai = aiSite({ site: "new-thing", dataClass: undefined, tier: "fast" });
    expect(ai.dataClass).toBe("S");
    await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    expect(openRouterCreate).not.toHaveBeenCalled();
  });

  it("checks the model actually sent on every attempt, not only the one the site resolved", async () => {
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "resume-screen", dataClass: "S", tier: "standard" });
    const client = ai.client();
    await client.messages.create(request(ai.model, ai.site));
    await expect(client.messages.create(request("gpt-5", ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
  });

  it("a Claude model goes to the Anthropic client with the request untouched", async () => {
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    expect(ai.model).toBe("claude-sonnet-5");
    const body = request(ai.model, ai.site);
    await ai.client().messages.create(body, { timeout: 5_000 });
    // The caller's timeout fits a 300 s route, so it stands, with both retries (Y.39).
    expect(anthropicCreate).toHaveBeenCalledWith(sent(body), { timeout: 5_000, maxRetries: 2 });
    expect(openRouterCreate).not.toHaveBeenCalled();
  });

  it("a class C site on a non-Claude model reaches OpenRouter with data collection denied", async () => {
    vi.stubEnv("AI_MODEL_MEETING_SUMMARY", "deepseek/deepseek-v4-pro");
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "ok", usage: { cost: 0.0021 } as Partial<Anthropic.Usage> }));
    const ai = aiSite({ site: "meeting-summary", dataClass: "C", tier: "fast" });
    await ai.client().messages.create(request(ai.model, ai.site));
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openRouterCreate.mock.calls[0][0]).toEqual({
      ...sent(request("deepseek/deepseek-v4-pro", ai.site)),
      provider: { data_collection: "deny", require_parameters: true },
    });
    expect(inserts[0]).toMatchObject({ provider: "openrouter", class: "C", cost_usd: 0.0021 });
  });

  it("a request's host pin reaches OpenRouter, and the class's guards still win", async () => {
    vi.stubEnv("AI_MODEL_MEETING_SUMMARY", "deepseek/deepseek-v4-pro");
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "meeting-summary", dataClass: "C", tier: "fast" });
    await ai.client().messages.create({
      ...request(ai.model, ai.site),
      provider: { order: ["deepinfra/fp8"], allow_fallbacks: false, data_collection: "allow" },
    });
    expect(openRouterCreate.mock.calls[0][0].provider).toEqual({
      order: ["deepinfra/fp8"],
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
    });
  });

  it("a host pin on a Claude request is dropped before api.anthropic.com sees it", async () => {
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await ai.client().messages.create({ ...request(ai.model, ai.site), provider: { order: ["deepinfra/fp8"] } });
    expect(anthropicCreate.mock.calls[0][0]).toEqual(sent(request(ai.model, ai.site)));
  });

  it("a site's configured host (AI_HOST_<SITE>) is sent as the provider order with no fallback (Y.79)", async () => {
    vi.stubEnv("AI_MODEL_MEETING_SUMMARY", "deepseek/deepseek-v4-pro");
    vi.stubEnv("AI_HOST_MEETING_SUMMARY", "deepinfra/fp8");
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "meeting-summary", dataClass: "C", tier: "fast" });
    await ai.client().messages.create(request(ai.model, ai.site));
    expect(openRouterCreate.mock.calls[0][0].provider).toEqual({
      order: ["deepinfra/fp8"],
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
    });
  });

  it("a configured fp4 host is refused before any network call, and nothing is recorded as a call", async () => {
    vi.stubEnv("AI_MODEL_IDEA_TRENDS", "deepseek/deepseek-v4-pro");
    vi.stubEnv("AI_HOST_IDEA_TRENDS", "deepinfra/fp4");
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    expect(openRouterCreate).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("a configured host is unused on a Claude model", async () => {
    vi.stubEnv("AI_HOST_IDEA_TRENDS", "deepinfra/fp8");
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await ai.client().messages.create(request(ai.model, ai.site));
    expect(anthropicCreate.mock.calls[0][0]).toEqual(sent(request(ai.model, ai.site)));
  });

  it("a models[] fallback list is checked entry by entry before any network call (Y.78)", async () => {
    vi.stubEnv("AI_MODEL_IDEA_TRENDS", "deepseek/deepseek-v4-pro");
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await expect(ai.client().messages.create({ ...request(ai.model, ai.site), models: ["anthropic/claude-sonnet-5"] })).rejects.toBeInstanceOf(AiRouteRefused);
    expect(openRouterCreate).not.toHaveBeenCalled();
    await ai.client().messages.create({ ...request(ai.model, ai.site), models: ["z-ai/glm-5.3"] });
    expect(openRouterCreate.mock.calls[0][0].models).toEqual(["z-ai/glm-5.3"]);
  });

  it("a class S or C site resolved to Fable throws before any network call", async () => {
    vi.stubEnv("AI_MODEL_REVIEW_SUMMARY", "claude-fable-5-1");
    vi.stubEnv("AI_MODEL_MEETING_SUMMARY", "claude-fable-5-1");
    for (const [site, dataClass] of [["review-summary", "S"], ["meeting-summary", "C"]] as const) {
      const ai = aiSite({ site, dataClass, tier: "standard" });
      await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    }
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });
});

describe("the ai_calls ledger", () => {
  it("one call writes one row of metadata, with no prompt or completion text", async () => {
    anthropicCreate.mockResolvedValue(
      fakeMessage({ text: "The candidate is strong.", usage: { input_tokens: 40, output_tokens: 7, cache_read_input_tokens: 3 } }),
    );
    const ai = aiSite({ site: "resume-screen", dataClass: "S", tier: "standard" });
    const res = await ai.client().messages.create(request(ai.model, ai.site));
    expect(res.content[0]).toMatchObject({ text: "The candidate is strong." });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      table: "ai_calls",
      site: "resume-screen",
      class: "S",
      provider: "anthropic",
      model: "claude-sonnet-5",
      input_tokens: 40,
      output_tokens: 7,
      cache_read_tokens: 3,
      prompt_version: promptFor("resume-screen").ref,
      input_hash: HELLO_HASH,
      run_id: null,
      ok: true,
      error_kind: null,
    });
    expect(typeof inserts[0].latency_ms).toBe("number");
    const row = JSON.stringify(inserts[0]);
    expect(row).not.toContain("hello");
    expect(row).not.toContain("You screen resumes.");
    expect(row).not.toContain("The candidate is strong.");
  });

  it("records the prompt the request names as name@version, and a variant under its own name", async () => {
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    const variant = definePrompt("idea-trends/weekly", { system: "You group invented ideas." });
    await ai.client().messages.create(request(ai.model, ai.site));
    await ai.client().messages.create({ ...request(ai.model, ai.site), prompt: variant });
    expect(inserts.map((r) => r.prompt_version)).toEqual([promptFor("idea-trends").ref, `idea-trends/weekly@${variant.version}`]);
    // The prompt field is the gateway's; the SDK never sees it.
    expect(anthropicCreate.mock.calls.every(([body]) => !("prompt" in body))).toBe(true);
  });

  it("refuses a prompt that belongs to another site before any network call, and writes no row", async () => {
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await expect(ai.client().messages.create(request(ai.model, "meeting-summary"))).rejects.toBeInstanceOf(AiPromptRefused);
    // A site whose name only starts the same way is another site.
    await expect(ai.client().messages.create(request(ai.model, "idea-trends-extra"))).rejects.toBeInstanceOf(AiPromptRefused);
    expect(() => ai.client().messages.stream(request(ai.model, "meeting-summary"))).toThrow(AiPromptRefused);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(anthropicStream).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("an other-provider call records its prompt and refuses another site's", async () => {
    const PROMPT_CLASS = "A" as const;
    const decl = { site: "brand-image", dataClass: PROMPT_CLASS, provider: "google" as const, model: "gemini-image", input: "a quince" };
    await otherProviderCall({ ...decl, prompt: promptFor("brand-image") }, async () => ({ value: 1, usage: null, ok: true }));
    expect(inserts[0]).toMatchObject({ site: "brand-image", prompt_version: promptFor("brand-image").ref });
    await expect(otherProviderCall({ ...decl, prompt: promptFor("idea-trends") }, async () => ({ value: 1, usage: null, ok: true }))).rejects.toBeInstanceOf(AiPromptRefused);
    expect(inserts).toHaveLength(1);
  });

  it("the site that picks the model and the site the row names can differ", async () => {
    vi.stubEnv("WRITER_CLAUDE_MODEL", "claude-opus-5");
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "writer-edit", modelSite: "brand-writer", dataClass: "A", tier: "frontier" });
    expect(ai.model).toBe("claude-opus-5");
    await ai.client().messages.create(request(ai.model, ai.site));
    expect(inserts[0]).toMatchObject({ site: "writer-edit", model: "claude-opus-5" });
  });

  it("a failed insert is logged and never fails the user's call", async () => {
    insertError.current = { message: "relation company_os.ai_calls does not exist" };
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await expect(ai.client().messages.create(request(ai.model, ai.site))).resolves.toMatchObject({ stop_reason: "end_turn" });
    expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join("\n")).toContain("ai-call-not-recorded");
  });

  it("a failed call is recorded as not ok and the error still reaches the caller", async () => {
    const boom = new Error("socket hang up");
    anthropicCreate.mockRejectedValue(boom);
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBe(boom);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ ok: false, error_kind: "unknown", input_tokens: null, output_tokens: null });
  });

  it("a refusal or a max_tokens cut-off is recorded as not ok, and the response still comes back", async () => {
    anthropicCreate.mockResolvedValueOnce(fakeMessage({ stopReason: "refusal" }));
    anthropicCreate.mockResolvedValueOnce(fakeMessage({ text: "{\"a\":", stopReason: "max_tokens" }));
    const ai = aiSite({ site: "idea-trends", dataClass: "B", tier: "fast" });
    const client = ai.client();
    expect((await client.messages.create(request(ai.model, ai.site))).stop_reason).toBe("refusal");
    expect((await client.messages.create(request(ai.model, ai.site))).stop_reason).toBe("max_tokens");
    expect(inserts.map((r) => [r.ok, r.error_kind])).toEqual([
      [false, "refusal"],
      [false, "max_tokens"],
    ]);
  });

  it("a streamed call is recorded when its final message arrives", async () => {
    const handlers = new Map<string, (arg: unknown) => void>();
    const final = fakeMessage({ text: "streamed", usage: { input_tokens: 9, output_tokens: 2 } });
    const fakeStream = {
      on(event: string, cb: (arg: unknown) => void) {
        handlers.set(event, cb);
        return fakeStream;
      },
      async finalMessage() {
        handlers.get("finalMessage")?.(final);
        return final;
      },
    };
    anthropicStream.mockReturnValue(fakeStream);
    const ai = aiSite({ site: "admin-chat", dataClass: "S", tier: "standard" });
    const s = ai.client().messages.stream({ ...request(ai.model, ai.site) });
    expect(anthropicStream).toHaveBeenCalledTimes(1);
    await s.finalMessage();
    await vi.waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({ site: "admin-chat", class: "S", input_tokens: 9, output_tokens: 2, ok: true });
  });

  it("a streamed call on a refused route throws before the stream opens", () => {
    vi.stubEnv("AI_MODEL_ADMIN_CHAT", "deepseek/deepseek-v4-pro");
    const ai = aiSite({ site: "admin-chat", dataClass: "S", tier: "standard" });
    expect(() => ai.client().messages.stream({ ...request(ai.model, ai.site) })).toThrow(AiRouteRefused);
    expect(anthropicStream).not.toHaveBeenCalled();
  });
});

// Y.67.3: roadmap-assist runs Qwen on its eval's host, and Sonnet 5 answers
// on the Anthropic API when Qwen has not answered in 12 s. These run on the
// real SITE_MODELS entry, declared as the route declares it.
describe("the fallback", () => {
  const roadmapAssist = () => aiSite({ site: "roadmap-assist", dataClass: "C", tier: "fast", routeSeconds: 60 });

  /** The first call as the SDK behaves under an abort: it waits, and rejects once the signal fires. */
  const hangsUntilAborted = (_body: unknown, options: { signal?: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()));
    });

  const hostError = () => new Anthropic.InternalServerError(502, { error: { message: "upstream" } }, "502 upstream", new Headers());

  it("sends roadmap-assist to Qwen on its pinned host, and takes Qwen's answer when it comes in time", async () => {
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "What does the process look like today?" }));
    const ai = roadmapAssist();
    expect(ai.model).toBe("qwen/qwen3.8-flash");
    const res = await ai.client().messages.create(request(ai.model, ai.site));
    expect(res.content[0]).toMatchObject({ text: "What does the process look like today?" });
    const [body, options] = openRouterCreate.mock.calls[0];
    expect(body.provider).toEqual({ order: ["alibaba"], allow_fallbacks: false, data_collection: "deny", require_parameters: true });
    // The first call's window is the fallback's 12 s, with the SDK's host retries inside it.
    expect(options).toMatchObject({ timeout: 12_000, maxRetries: 2 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ site: "roadmap-assist", provider: "openrouter", model: "qwen/qwen3.8-flash", ok: true });
  });

  it("aborts Qwen at 12 s and answers with Sonnet 5 on the Anthropic API, recording both calls", async () => {
    vi.useFakeTimers();
    openRouterCreate.mockImplementation(hangsUntilAborted);
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "Got it, here is the item." }));
    const ai = roadmapAssist();
    const pending = ai.client().messages.create(request(ai.model, ai.site));
    await vi.advanceTimersByTimeAsync(11_999);
    expect(anthropicCreate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;
    expect(res.content[0]).toMatchObject({ text: "Got it, here is the item." });
    // The same request, on the fallback's model, with no host pin: api.anthropic.com does not read one.
    expect(anthropicCreate.mock.calls[0][0]).toEqual({ ...sent(request("claude-sonnet-5", ai.site)) });
    // What the first call left of the 60 s route: 48 s, less the 20 s margin.
    expect(anthropicCreate.mock.calls[0][1]).toEqual({ timeout: 28_000, maxRetries: 0 });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({ site: "roadmap-assist", provider: "openrouter", model: "qwen/qwen3.8-flash", ok: false, error_kind: "timeout", latency_ms: 12_000 });
    expect(inserts[1]).toMatchObject({ site: "roadmap-assist:fallback", class: "C", provider: "anthropic", model: "claude-sonnet-5", ok: true, error_kind: null });
    // One request, two attempts: the same prompt and the same input.
    expect(inserts[1].prompt_version).toBe(inserts[0].prompt_version);
    expect(inserts[1].input_hash).toBe(inserts[0].input_hash);
  });

  it("falls back on a host error the SDK's retries did not clear", async () => {
    openRouterCreate.mockRejectedValue(hostError());
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    const ai = roadmapAssist();
    await expect(ai.client().messages.create(request(ai.model, ai.site))).resolves.toMatchObject({ content: [{ text: "ok" }] });
    expect(inserts.map((r) => [r.site, r.model, r.ok, r.error_kind])).toEqual([
      ["roadmap-assist", "qwen/qwen3.8-flash", false, "api_error"],
      ["roadmap-assist:fallback", "claude-sonnet-5", true, null],
    ]);
  });

  it("falls back on an answer the site cannot use, and on non-JSON when a JSON schema was asked for", async () => {
    const ai = roadmapAssist();
    openRouterCreate.mockResolvedValueOnce(fakeMessage({ stopReason: "refusal" }));
    anthropicCreate.mockResolvedValueOnce(fakeMessage({ text: "ok" }));
    await ai.client().messages.create(request(ai.model, ai.site));
    openRouterCreate.mockResolvedValueOnce(fakeMessage({ text: "not json" }));
    anthropicCreate.mockResolvedValueOnce(fakeMessage({ text: "{\"a\":1}" }));
    const structured = { ...request(ai.model, ai.site), output_config: { format: { type: "json_schema" as const, schema: { type: "object" } } } };
    await ai.client().messages.create(structured as Anthropic.MessageCreateParamsNonStreaming & PromptTag);
    // The schema travels with the fallback request.
    expect(anthropicCreate.mock.calls[1][0].output_config).toEqual(structured.output_config);
    expect(inserts.map((r) => [r.site, r.ok, r.error_kind])).toEqual([
      ["roadmap-assist", false, "refusal"],
      ["roadmap-assist:fallback", true, null],
      ["roadmap-assist", false, "unknown"],
      ["roadmap-assist:fallback", true, null],
    ]);
  });

  it("when the fallback fails too, its error reaches the site, and both calls are recorded", async () => {
    const fallbackError = new Anthropic.InternalServerError(500, { error: { message: "overloaded" } }, "500 overloaded", new Headers());
    openRouterCreate.mockRejectedValue(hostError());
    anthropicCreate.mockRejectedValue(fallbackError);
    const ai = roadmapAssist();
    await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBe(fallbackError);
    expect(inserts.map((r) => [r.site, r.provider, r.ok, r.error_kind])).toEqual([
      ["roadmap-assist", "openrouter", false, "api_error"],
      ["roadmap-assist:fallback", "anthropic", false, "api_error"],
    ]);
  });

  it("refuses a fallback the site's class would not allow, before any call and with no row", async () => {
    // Class S runs on the Anthropic API only; class C never runs on Fable.
    fallbacks.set("fallback-probe-s", { model: "qwen/qwen3.8-flash", afterMs: 12_000 });
    fallbacks.set("fallback-probe-c", { model: "claude-fable-5-1", afterMs: 12_000 });
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    for (const [site, dataClass] of [["fallback-probe-s", "S"], ["fallback-probe-c", "C"]] as const) {
      const ai = aiSite({ site, dataClass, tier: "standard" });
      await expect(ai.client().messages.create(request(ai.model, ai.site))).rejects.toBeInstanceOf(AiRouteRefused);
    }
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openRouterCreate).not.toHaveBeenCalled();
    expect(inserts).toEqual([]);
  });

  it("a caller's own abort is not a reason to fall back", async () => {
    openRouterCreate.mockImplementation(hangsUntilAborted);
    const ai = roadmapAssist();
    const caller = new AbortController();
    const pending = ai.client().messages.create(request(ai.model, ai.site), { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toBeInstanceOf(Anthropic.APIUserAbortError);
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
  });

  it("has no fallback, and no abort, when the site is already on the fallback's model or its provider has no key", async () => {
    anthropicCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    openRouterCreate.mockResolvedValue(fakeMessage({ text: "ok" }));
    // Y.67.1's bridge override puts the site on Sonnet 5 itself.
    vi.stubEnv("AI_MODEL_ROADMAP_ASSIST", "claude-sonnet-5");
    const onSonnet = roadmapAssist();
    await onSonnet.client().messages.create(request(onSonnet.model, onSonnet.site));
    expect(anthropicCreate.mock.calls[0][1]).not.toHaveProperty("signal");
    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_URL", "https://db.example.test");
    anthropicKey.set = false;
    const noKey = roadmapAssist();
    await noKey.client().messages.create(request(noKey.model, noKey.site));
    expect(openRouterCreate.mock.calls[0][1]).not.toHaveProperty("signal");
  });
});

// Y.39: every call's timeout and retries fit inside its route's maxDuration.
describe("callBudget", () => {
  it("keeps one retry for a 120 s call in a 300 s route", async () => {
    const { callBudget } = await import("@/kernel/ai/gateway");
    expect(callBudget(300, 120_000)).toEqual({ timeout: 120_000, maxRetries: 1 });
  });
  it("caps a 600 s writer step to 280 s with no retry", async () => {
    const { callBudget } = await import("@/kernel/ai/gateway");
    expect(callBudget(undefined, 600_000)).toEqual({ timeout: 280_000, maxRetries: 0 });
  });
  it("fits a 60 s route: 40 s and no retry", async () => {
    const { callBudget } = await import("@/kernel/ai/gateway");
    expect(callBudget(60, undefined)).toEqual({ timeout: 40_000, maxRetries: 0 });
  });
});
