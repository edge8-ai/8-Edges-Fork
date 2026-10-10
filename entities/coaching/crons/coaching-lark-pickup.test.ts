import { beforeEach, describe, expect, it, vi } from "vitest";

// The one nightly 1-1 job (K.73 folded into #1933): the pickup first, then the
// linked pass, on the same day and the same clock, reported in one body so it
// is one routine_runs row.

const order = vi.hoisted(() => [] as string[]);
// The real outcome rule (Y.13) decides the response; only the bearer and run row are stubbed.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));
vi.mock("@/entities/coaching", () => ({ saigonToday: () => "2026-10-08" }));
const pickupErrors = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock("@/entities/coaching/lib/lark-pickup", () => ({
  runLarkPickup: async (today: string) => {
    order.push(`pickup ${today}`);
    return pickupErrors.value.length > 0
      ? { connections: 1, picked: [{ day: today }], errors: pickupErrors.value }
      : { connections: 1, picked: [{ day: today }] };
  },
}));
const linkedFailures = { failedSaves: 0, failedRecaps: 0 };
const pull = vi.fn(async (today: string, _startedAt: number) => {
  order.push(`linked ${today}`);
  return linkedFailures.failedSaves || linkedFailures.failedRecaps
    ? { linked: 2, transcriptsPulled: 1, recapsDrafted: 1, notShared: 1, ...linkedFailures }
    : { linked: 2, transcriptsPulled: 1, recapsDrafted: 1, notShared: 1 };
});
vi.mock("@/entities/coaching/lib/cycle-minutes", () => ({
  pullLinkedTranscripts: (today: string, startedAt: number) => pull(today, startedAt),
}));

import { GET } from "./coaching-lark-pickup";

describe("the coaching-lark-pickup job", () => {
  beforeEach(() => {
    order.length = 0;
    pickupErrors.value = [];
    linkedFailures.failedSaves = 0;
    linkedFailures.failedRecaps = 0;
  });

  it("runs the pickup, then the linked pass, and reports both", async () => {
    const before = Date.now();
    const res = await GET(new Request("https://example.test/api/cron/coaching-lark-pickup/"));
    expect(order).toEqual(["pickup 2026-10-08", "linked 2026-10-08"]);
    // The linked pass is handed the run's start, so the pickup's time counts.
    expect(pull.mock.calls[0][1]).toBeGreaterThanOrEqual(before);
    expect(pull.mock.calls[0][1]).toBeLessThanOrEqual(Date.now());
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      failures: [],
      picked: 1,
      transcriptsPulled: 1,
      recapsDrafted: 1,
      notShared: 1,
      pickup: { connections: 1, picked: [{ day: "2026-10-08" }] },
      linked: { linked: 2, transcriptsPulled: 1, recapsDrafted: 1, notShared: 1 },
    });
    expect(res.status).toBe(200);
  });

  // Y.88: a dead connection or a failed recap used to sit inside a 200 and
  // record ok; routine_runs.error and the repeated-failure alert read `error`.
  it("a coach's pickup error is an error run that names it", async () => {
    pickupErrors.value = ["tm-1: the Lark refresh token expired"];
    const res = await GET(new Request("https://example.test/api/cron/coaching-lark-pickup/"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Lark pickup at pickup: tm-1: the Lark refresh token expired");
  });

  it("a transcript or recap the linked pass could not save is an error run", async () => {
    linkedFailures.failedSaves = 1;
    linkedFailures.failedRecaps = 2;
    const res = await GET(new Request("https://example.test/api/cron/coaching-lark-pickup/"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Lark pickup at linked pass: 1 transcript not saved; 2 recaps not drafted");
  });
});
