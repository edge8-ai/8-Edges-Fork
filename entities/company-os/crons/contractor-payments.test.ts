import { beforeEach, describe, expect, it, vi } from "vitest";

// The contractor roll-up (Y.22): a contractor whose payment could not be
// written is a failure the run names. A contractor skipped by design (no rate,
// a payment already decided) is reported in the ping and is not a failure.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const rollup = vi.hoisted(() => vi.fn());
vi.mock("@/entities/company-os/lib/contractor-payments", () => ({ periodMonth: () => "2026-09-01", rollupContractorPayments: rollup }));
const pingOps = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/entities/portal", () => ({ pingOps }));

import { GET } from "./contractor-payments";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/contractor-payments/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const summary = { period: "2026-09-01", created: 1, updated: 0, requestsLinked: 2, skipped: [], failed: [] };

beforeEach(() => {
  rollup.mockReset();
  pingOps.mockClear();
});

describe("the contractor payments cron", () => {
  it("is an ok run with the roll-up's counters when every payment was written", async () => {
    rollup.mockResolvedValue(summary);
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", created: 1, requestsLinked: 2, failures: [] } });
  });

  it("is skipped when there was no accepted work to roll up", async () => {
    rollup.mockResolvedValue({ ...summary, created: 0, requestsLinked: 0 });
    expect(await run()).toMatchObject({ status: 200, body: { status: "skipped" } });
    expect(pingOps).not.toHaveBeenCalled();
  });

  it("a contractor skipped by design is reported, not a failure", async () => {
    rollup.mockResolvedValue({ ...summary, skipped: ["Ann: no current hourly rate — work left unlinked"] });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", failures: [] } });
    expect(pingOps).toHaveBeenCalled();
  });

  it("a payment that could not be written is an error that names the contractor", async () => {
    const line = "Ann: payment insert failed (db down)";
    rollup.mockResolvedValue({ ...summary, skipped: [line], failed: [line] });
    expect(await run()).toMatchObject({ status: 500, body: { error: "Ann at roll up payment: payment insert failed (db down)", created: 1 } });
  });

  it("a roll-up that could not start stays an early 500", async () => {
    rollup.mockResolvedValue({ error: "db down" });
    expect(await run()).toEqual({ status: 500, body: { error: "db down" } });
  });
});
