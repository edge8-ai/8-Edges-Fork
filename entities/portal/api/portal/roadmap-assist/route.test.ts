import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeMessage } from "@/kernel/ai/testing/fake-message";

// Y.67.3: roadmap-assist answers a client live on Qwen, and Sonnet 5 answers
// when Qwen has not in 12 s. The gateway and the model registry run for real;
// the portal session, the roadmap's sections, the two model clients and the
// ai_calls insert are replaced.

const { openRouterCreate, anthropicCreate, inserts } = vi.hoisted(() => ({
  openRouterCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("@/kernel/identity/portal-auth", () => ({ getPortalActor: async () => ({ actor: { greeting: "Lan", displayName: "Lan" } }) }));
vi.mock("@/entities/portal/lib/roles", () => ({ contributorCompanyScope: () => ["company-1"] }));
vi.mock("@/entities/portal/lib/backlog", () => ({
  getGroupsForActor: async () => [{ key: "ops", title: "Operations", intro: null }],
}));
vi.mock("@/entities/client-programs", () => ({ isBacklogPriority: (p: string) => ["now", "next", "later"].includes(p) }));
vi.mock("@/kernel/ai/client", () => {
  const anthropicClient = { messages: { create: anthropicCreate, stream: vi.fn() } };
  const openRouterClient = { messages: { create: openRouterCreate, stream: vi.fn() } };
  return {
    anthropic: () => anthropicClient,
    anthropicIfConfigured: () => anthropicClient,
    openRouter: () => openRouterClient,
    openRouterIfConfigured: () => openRouterClient,
  };
});
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
    }),
  },
}));

import { POST } from "./route";

async function ask() {
  const req = new Request("https://edge8.test/api/portal/roadmap-assist", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "Our invoices are typed in by hand." }] }),
  });
  const res = await POST(req as never);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const DRAFT = 'Here is your item.\n\n```json\n{"title": "Read invoices automatically", "note": "Finance types invoices by hand.", "groupKey": "ops", "priority": "next"}\n```';

beforeEach(() => {
  openRouterCreate.mockReset();
  anthropicCreate.mockReset();
  inserts.length = 0;
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("roadmap-assist on Qwen with a Sonnet 5 fallback", () => {
  it("answers from Qwen when Qwen answers in time", async () => {
    openRouterCreate.mockResolvedValue({ ...fakeMessage({ text: DRAFT }), model: "qwen/qwen3.8-flash" });
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body.draft).toMatchObject({ title: "Read invoices automatically", groupKey: "ops" });
    expect(openRouterCreate.mock.calls[0][0]).toMatchObject({ model: "qwen/qwen3.8-flash", provider: { order: ["alibaba"], allow_fallbacks: false } });
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it("answers from Sonnet 5 when Qwen has not answered in 12 s", async () => {
    vi.useFakeTimers();
    openRouterCreate.mockImplementation(
      (_body: unknown, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new Anthropic.APIUserAbortError()))),
    );
    anthropicCreate.mockResolvedValue({ ...fakeMessage({ text: DRAFT }), model: "claude-sonnet-5" });
    const pending = ask();
    await vi.advanceTimersByTimeAsync(12_000);
    const { status, body } = await pending;
    expect(status).toBe(200);
    expect(body.draft).toMatchObject({ title: "Read invoices automatically" });
    expect(anthropicCreate.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5" });
    expect(inserts.map((r) => [r.site, r.model, r.ok, r.error_kind])).toEqual([
      ["roadmap-assist", "qwen/qwen3.8-flash", false, "timeout"],
      ["roadmap-assist:fallback", "claude-sonnet-5", true, null],
    ]);
  });

  it("gives the site's usual error when both fail, with both calls recorded", async () => {
    openRouterCreate.mockRejectedValue(new Anthropic.InternalServerError(502, undefined, "502 upstream", new Headers()));
    anthropicCreate.mockRejectedValue(new Anthropic.InternalServerError(529, undefined, "529 overloaded", new Headers()));
    const { status, body } = await ask();
    expect(status).toBe(502);
    expect(body).toEqual({ error: "The assistant hit a problem. Please try again." });
    expect(inserts.map((r) => [r.site, r.ok])).toEqual([
      ["roadmap-assist", false],
      ["roadmap-assist:fallback", false],
    ]);
  });
});
