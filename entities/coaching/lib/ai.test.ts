import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Characterisation of generateTrendReport's write path. The trend stamp is the
// only place the report is persisted, and before the rule-2 sweep its upsert
// error was discarded: a failed write returned { ok: true } with no report on
// the row. These cases pin the new failure return and the untouched success.
//
// The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts).

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
}));
vi.mock("@/kernel/ai/client", () => ({
  anthropicIfConfigured: () => ({ messages: { create: async () => ({}) } }),
}));
vi.mock("@/kernel/ai/models", () => ({ modelFor: () => "claude-test-model", siteModelFor: () => "claude-test-model", hostFor: () => null, fallbackFor: () => null }));
// A factory mock replaces the whole module. This suite exercises the free-text
// trend report, which still reads through readTextOutput; jsonSchemaFor is here
// because prompts.ts derives the summary schema at module load (ADR 0006).
vi.mock("@/kernel/ai/response", () => ({
  jsonSchemaFor: () => ({}),
  readTextOutput: () => ({ ok: true, text: "The trend report." }),
}));
vi.mock("./data/goals", () => ({
  getEdgesLadderOptions: async () => ({ objectives: [], keyResults: [] }),
}));

import { generateTrendReport } from "./ai";

const PROFILE = {
  id: "profile-1",
  coach_id: "coach-1",
  retention_root: null,
  private_profile_markdown: null,
  cadence_days: 14,
  team_members: { people: { full_name: "Ada", preferred_name: "Ada" }, positions: { title: "Engineer" } },
};
const MEETINGS = [
  { held_on: "2026-02-10", summary_markdown: "Second." },
  { held_on: "2026-01-10", summary_markdown: "First." },
];

beforeEach(() => {
  resetFake();
  // 1: loadProfileContext.
  script("coaching_profiles", { data: PROFILE });
  // 1: the trend window (newest first, reversed by the caller); 2: the mode
  // history the trend context reads.
  script("coaching_one_on_ones", { data: MEETINGS }, { data: [] });
  // The rest of the trend context answers empty, which each loader renders as
  // a "(none)" block. The kernel fake throws on a read nobody scripted, so each
  // is named.
  for (const table of ["coaching_context", "coaching_commitments", "coaching_checkins", "goals"]) script(table, { data: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateTrendReport", () => {
  it("returns the upsert's error when the trend stamp fails", async () => {
    script("coaching_trends", { data: null }, { error: { message: "upsert denied" } });

    const res = await generateTrendReport("profile-1");

    expect(res).toEqual({ ok: false, error: "upsert denied" });
  });

  it("still returns ok when the stamp lands", async () => {
    script("coaching_trends", { data: null }, { error: null });

    const res = await generateTrendReport("profile-1");

    expect(res).toEqual({ ok: true });
    const stamp = calls.filter((c) => c.table === "coaching_trends" && c.ops.includes("upsert"))[0];
    const row = stamp.payloads[0] as { period: string; report_markdown: string };
    expect(row.period).toBe("2026-01");
    expect(row.report_markdown).toBe("The trend report.");
  });
});
