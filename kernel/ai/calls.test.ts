import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inserts, insertResult } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  insertResult: { current: { error: null as { message: string } | null } as { error: { message: string } | null } | (() => never) },
}));

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => ({
      insert: async (row: unknown) => {
        inserts.push({ table, row });
        const r = insertResult.current;
        if (typeof r === "function") return r();
        return r;
      },
    }),
  },
}));

// The run on the current async chain (Y.72.1), controlled per test.
const runOnChain = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/kernel/audit/routine-runs", () => ({ currentRunId: () => runOnChain.id }));

import { inputHashOf, recordAiCall, type AiCallRecord } from "@/kernel/ai/calls";

const call: AiCallRecord = {
  site: "resume-screen",
  dataClass: "S",
  provider: "anthropic",
  model: "claude-sonnet-5",
  usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 },
  costUsd: null,
  latencyMs: 812,
  promptVersion: "1",
  inputHash: "ab".repeat(32),
  ok: true,
  errorKind: null,
};

beforeEach(() => {
  inserts.length = 0;
  insertResult.current = { error: null };
  runOnChain.id = null;
  vi.stubEnv("SUPABASE_URL", "https://db.example.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("recordAiCall", () => {
  it("writes one ai_calls row of metadata", async () => {
    await recordAiCall(call);
    expect(inserts).toEqual([
      {
        table: "ai_calls",
        row: {
          site: "resume-screen",
          class: "S",
          provider: "anthropic",
          model: "claude-sonnet-5",
          input_tokens: 120,
          output_tokens: 30,
          cache_read_tokens: 4,
          cache_write_tokens: 0,
          // 120 x $2 + 30 x $10 + 4 x $0.2 per million (Y.76's price table).
          cost_usd: 0.000541,
          latency_ms: 812,
          prompt_version: "1",
          input_hash: "ab".repeat(32),
          run_id: null,
          ok: true,
          error_kind: null,
        },
      },
    ]);
  });

  it("keeps a provider-reported cost over the price table", async () => {
    await recordAiCall({ ...call, costUsd: 0.0123 });
    expect(inserts[0].row).toMatchObject({ cost_usd: 0.0123 });
  });

  it("records the routine run on the current async chain (Y.72.1)", async () => {
    runOnChain.id = "run-42";
    await recordAiCall(call);
    expect(inserts[0].row).toMatchObject({ run_id: "run-42" });
  });

  it("a call that failed before a response records null tokens", async () => {
    await recordAiCall({ ...call, usage: null, ok: false, errorKind: "timeout" });
    expect(inserts[0].row).toMatchObject({
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_write_tokens: null,
      ok: false,
      error_kind: "timeout",
    });
  });

  it("a failed insert is logged and never thrown", async () => {
    insertResult.current = { error: { message: "permission denied" } };
    await expect(recordAiCall(call)).resolves.toBeUndefined();
    const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("ai-call-not-recorded");
    expect(logged).toContain("permission denied");
  });

  it("an insert that throws is logged and never thrown", async () => {
    insertResult.current = () => {
      throw new Error("fetch failed");
    };
    await expect(recordAiCall(call)).resolves.toBeUndefined();
    expect(vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join("\n")).toContain("fetch failed");
  });

  it("without a database configured nothing is written and nothing throws", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    await expect(recordAiCall(call)).resolves.toBeUndefined();
    expect(inserts).toEqual([]);
  });
});

describe("inputHashOf", () => {
  it("is the sha256 hex of the messages, stable for equal input", () => {
    const a = inputHashOf([{ role: "user", content: "hello" }]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(inputHashOf([{ role: "user", content: "hello" }])).toBe(a);
    expect(inputHashOf([{ role: "user", content: "hello!" }])).not.toBe(a);
    // Known value, from `printf '%s' '[{"role":"user","content":"hello"}]' | shasum -a 256`.
    expect(a).toBe("e920b204bce6401c9e1a506f434853899fabada37ae5ad9033d8937eda0ba853");
  });
});
