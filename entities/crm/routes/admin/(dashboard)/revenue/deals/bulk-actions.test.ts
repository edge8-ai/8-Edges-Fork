import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The bulk editor's half of R.23: an edit that clears the expected close date
// is judged per deal against the stage it is in, the same rule updateDeal
// applies one deal at a time. The forecast gate in lib/deal-stage is the real
// one, so deleting the check here turns these red.

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table), rpc: vi.fn(async () => ({ error: null })) },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action asks for its declared permission (ADR 0013); recorded so the test pins which one.
const asked: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: async (p: string) => {
    asked.push(p);
    return { user: { email: "admin@example.com" } };
  },
}));
const recordAuditMany = vi.fn(async () => {});
vi.mock("@/kernel/audit/audit", () => ({ recordAuditMany: (...a: unknown[]) => recordAuditMany(...(a as [])) }));
vi.mock("@/entities/crm/lib/mutations", () => ({ archiveRecord: vi.fn(), guardedDelete: vi.fn() }));
vi.mock("@/entities/crm/lib/deal-close", () => ({ moveDealToStage: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/kernel/identity/person-by-email", () => ({ personIdForEmailOrNull: async () => "admin-person" }));

import { bulkUpdateDeals } from "./bulk-actions";

const STAGES = [
  { id: "s-disc", name: "Discovery", position: 1, is_won: false, is_lost: false },
  { id: "s-prop", name: "Proposal", position: 2, is_won: false, is_lost: false },
  { id: "s-won", name: "Won", position: 4, is_won: true, is_lost: false },
];
const deal = (id: string, stage_id: string) => ({ id, stage_id, amount_cents: 100000, expected_close_date: "2026-11-01" });

beforeEach(() => {
  resetFake();
  asked.length = 0;
});
afterEach(() => vi.clearAllMocks());

describe("bulk deal actions · access", () => {
  it("asks for crm.pipeline before reading or writing deals", async () => {
    script("deals", {});
    await bulkUpdateDeals(["d1"], { country: "x" } as never);
    expect(asked[0]).toBe("crm.pipeline");
  });
});

describe("bulkUpdateDeals clearing the expected close date", () => {
  it("refuses the whole batch when any deal is at Proposal or later, and writes nothing", async () => {
    script("deals", { data: [deal("d1", "s-disc"), deal("d2", "s-prop")] });
    script("pipeline_stages", { data: STAGES });

    expect(await bulkUpdateDeals(["d1", "d2"], { expected_close_date: null })).toEqual({
      ok: false,
      error: "1 of 2 selected deals cannot change. A deal in Proposal keeps an expected close date, so the forecast can count it.",
    });
    expect(calls.filter((c) => c.table === "deals" && c.ops.includes("update"))).toHaveLength(0);
    expect(recordAuditMany).not.toHaveBeenCalled();
  });

  it("clears it when every deal is before Proposal or closed", async () => {
    script("deals", { data: [deal("d1", "s-disc"), deal("d2", "s-won")] }, {});
    script("pipeline_stages", { data: STAGES });

    expect(await bulkUpdateDeals(["d1", "d2"], { expected_close_date: "" })).toEqual({ ok: true, message: "Updated 2 deals." });
    const write = calls.find((c) => c.table === "deals" && c.ops.includes("update"));
    expect(write?.payloads[0]).toEqual({ expected_close_date: null });
  });

  it("reads nothing extra for an edit that clears no input", async () => {
    script("deals", {});

    expect(await bulkUpdateDeals(["d1"], { expected_close_date: "2026-12-01", source: "referral" })).toEqual({ ok: true, message: "Updated 1 deal." });
    expect(calls.map((c) => `${c.table}:${c.ops[0]}`)).toEqual(["deals:update"]);
  });
});
