import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

const usdRate = vi.fn();
vi.mock("@/kernel/data/fx", () => ({ usdRate: (...a: unknown[]) => usdRate(...a) }));

import { refreshCachedRates } from "./fx-refresh";

const updates = () => calls.filter((c) => c.table === "fx_rates" && c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  usdRate.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T00:15:00.000Z"));
});

describe("refreshCachedRates", () => {
  it("refreshes each cached currency, skips one the source cannot price, and never asks for USD", async () => {
    script("fx_rates", { data: [{ currency: "usd" }, { currency: "aud" }, { currency: "vnd" }] }, {});
    usdRate.mockImplementation(async (c: string) => {
      if (c === "vnd") throw new Error("FX lookup failed for VND: 404");
      return { rate: 0.70239, asOf: "2026-09-26" };
    });

    expect(await refreshCachedRates()).toEqual({
      ok: true,
      refreshed: [{ currency: "aud", rate: 0.70239, asOf: "2026-09-26" }],
      skipped: [{ currency: "vnd", reason: "FX lookup failed for VND: 404" }],
    });
    expect(usdRate.mock.calls.map((a) => a[0])).toEqual(["aud", "vnd"]);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payloads[0]).toEqual({ rate_to_usd: 0.70239, updated_at: "2026-09-28T00:15:00.000Z" });
    expect(updates()[0].filters).toContainEqual(["eq", "currency", "aud"]);
  });

  it("reports a failed cache write as skipped, not refreshed", async () => {
    script("fx_rates", { data: [{ currency: "aud" }, { currency: "eur" }] }, { error: { message: "write refused" } }, {});
    usdRate.mockResolvedValue({ rate: 0.7, asOf: "2026-09-26" });

    const r = await refreshCachedRates();
    expect(r).toMatchObject({ ok: true, skipped: [{ currency: "aud", reason: "write refused" }] });
    expect(r.ok && r.refreshed.map((x) => x.currency)).toEqual(["eur"]);
  });

  it("fails the run when no lookup succeeds, so the source being down is visible", async () => {
    script("fx_rates", { data: [{ currency: "aud" }] });
    usdRate.mockRejectedValue(new Error("FX lookup failed for AUD: 503"));

    expect(await refreshCachedRates()).toEqual({ ok: false, error: "No rate refreshed: aud (FX lookup failed for AUD: 503)" });
    expect(updates()).toHaveLength(0);
  });

  it("returns the read error rather than refreshing nothing quietly", async () => {
    script("fx_rates", { error: { message: "permission denied" } });
    expect(await refreshCachedRates()).toEqual({ ok: false, error: "permission denied" });
    expect(usdRate).not.toHaveBeenCalled();
  });
});
