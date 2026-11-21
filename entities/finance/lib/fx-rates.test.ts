import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerNext, queries, resetQueries } from "./testing/query-log";

vi.mock("@/kernel/data/supabase", async () => ({ companyOs: (await import("./testing/query-log")).recordingClient }));

import { cacheFxRate, fxRates } from "./fx-rates";

// A.65: the queries crm's deal-fx.ts and retreats' event-pnl.ts (the cache
// write) and crm's runway (the read) built by hand around upsertFxRates and
// selectFxRates before the card.
const NOW = "2026-10-18T03:00:00.000Z";

beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

describe("finance's FX-rate question and command", () => {
  it("caches a rate on the currency's own row", async () => {
    expect(await cacheFxRate("aud", 0.66)).toEqual({ ok: true });
    expect(queries).toEqual([
      { table: "fx_rates", steps: [["upsert", { currency: "aud", rate_to_usd: 0.66, updated_at: NOW }, { onConflict: "currency" }]] },
    ]);
  });

  it("answers a failed cache write as a Result, for the caller that logs it", async () => {
    answerNext({ data: null, error: { message: "write refused" } });
    expect(await cacheFxRate("aud", 0.66)).toEqual({ ok: false, error: "write refused" });
  });

  it("reads every cached rate, up to five hundred", async () => {
    await fxRates();
    expect(queries).toEqual([{ table: "fx_rates", steps: [["select", "currency, rate_to_usd"], ["limit", 500]] }]);
  });
});
