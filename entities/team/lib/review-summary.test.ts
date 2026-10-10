import { companyOs } from "@/kernel/data/supabase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Characterisation of summarizeReviewCall's write path. The "ready" patch IS the
// result of the action: before the rule-2 sweep its update error was discarded
// and the action returned { ok: true } with nothing saved. These cases pin the
// new behaviour (the failure surfaces) and the untouched success path.
//
// The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts): `companyOs.from(table)` returns a
// chainable builder that resolves to the next scripted response for that
// table, records its operations and the rows it writes, and throws on a query
// no test scripted.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({ messages: { create: async () => ({}) } }),
}));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
// A factory mock replaces the whole module, so it has to carry every export the
// module under test imports. `readStructuredOutput` now owns the parse and the
// schema check (ADR 0006); the fixture below satisfies the schema, which is why
// returning its data directly is faithful rather than a bypass.
vi.mock("@/kernel/ai/response", () => ({
  jsonSchemaFor: () => ({}),
  readStructuredOutput: () => ({
    ok: true,
    data: { overview: "An overview.", strengths: [], growth_areas: [], dimensions: [] },
  }),
}));
// lib/reviews pulls in team-auth (and React's `cache`), which does not load
// outside a request; only the dimension list matters here.
vi.mock("@/entities/team/lib/reviews", () => ({
  REVIEW_DIMENSIONS: [{ key: "craft", label: "Craft" }],
}));
vi.mock("@/entities/team/lib/reviews/transcript", () => ({
  readReviewTranscript: async () => "A transcript.",
}));

import { summarizeReviewCall } from "./review-summary";

beforeEach(() => resetFake());
afterEach(() => {
  vi.restoreAllMocks();
});

describe("summarizeReviewCall", () => {
  it("returns the write's error when the ready patch fails", async () => {
    // 1: patchSummary's metadata read. 2: the metadata update, which fails.
    script("performance_reviews", { data: { metadata: {} } }, { error: { message: "update denied" } });

    const res = await summarizeReviewCall("review-1");

    expect(res).toEqual({ ok: false, error: "update denied" });
  });

  it("still returns ok when the patch lands", async () => {
    script("performance_reviews", { data: { metadata: {} } }, { error: null });

    const res = await summarizeReviewCall("review-1");

    expect(res).toEqual({ ok: true });
    const patch = calls.filter((c) => c.table === "performance_reviews")[1].payloads[0] as {
      metadata: { transcript_summary: { ai_status: string; overview: string } };
    };
    expect(patch.metadata.transcript_summary.ai_status).toBe("ready");
    expect(patch.metadata.transcript_summary.overview).toBe("An overview.");
  });
});
