import { beforeEach, describe, expect, it, vi } from "vitest";

// The nightly revenue snapshot (Y.22): on the 1st a digest that did not go out
// is a failure the run names; on every other night "not the first of the
// month" is the design and the run stays ok.
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
const take = vi.hoisted(() => vi.fn());
vi.mock("@/entities/crm/lib/revenue-metrics/snapshot", () => ({ takeRevenueSnapshot: take }));
vi.mock("@/entities/crm/lib/revenue-metrics/digest", () => ({ NOT_DIGEST_DAY: "not the first of the month" }));

import { GET } from "./revenue-snapshot";

const run = async () => {
  const res = await GET(new Request("https://os.example/api/cron/revenue-snapshot/"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const taken = { ok: true, takenOn: "2026-10-01", openDeals: 4, openUsdCents: 1000 };

beforeEach(() => take.mockReset());

describe("the revenue snapshot cron", () => {
  it("is an ok run on an ordinary night, with the digest reported as not due", async () => {
    take.mockResolvedValue({ ...taken, digest: { posted: false, reason: "not the first of the month" } });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", openDeals: 4, digestPosted: false, failures: [] } });
  });

  it("is an ok run when the month-end digest went out", async () => {
    take.mockResolvedValue({ ...taken, digest: { posted: true } });
    expect(await run()).toMatchObject({ status: 200, body: { status: "ok", digestPosted: true, failures: [] } });
  });

  it("is an error that names the digest when it was due and did not go out", async () => {
    take.mockResolvedValue({ ...taken, digest: { posted: false, reason: "Lark did not accept the message (webhook unset or rejected)" } });
    expect(await run()).toMatchObject({
      status: 500,
      body: { error: "month-end digest at post the digest: Lark did not accept the message (webhook unset or rejected)", openDeals: 4 },
    });
  });

  it("a snapshot that could not be written stays an early 500", async () => {
    take.mockResolvedValue({ ok: false, error: "db down" });
    expect(await run()).toEqual({ status: 500, body: { error: "db down" } });
  });
});
