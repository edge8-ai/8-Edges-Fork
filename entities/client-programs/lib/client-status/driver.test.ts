import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetFakes } from "./testing/fakes";
import { ACME, board, CO_A, roadmap, WEEK } from "./testing/fixtures";

// Z.12 spec §12 test 11, through the kernel's real tick driver: a step that has
// failed three times is not run a fourth time; the driver stops the report with
// the last error, and the report's own Retry gives it a fresh epoch.

const runs = vi.hoisted(() => ({ failures: [] as { started_at: string; error: string | null; summary: string | null }[] }));

vi.mock("@/kernel/data/supabase", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: runs.failures, error: null });
  return { companyOs: { from: () => builder } };
});
vi.mock("@/kernel/audit/effects", async () => (await import("./testing/fakes")).effectsFake);
vi.mock("@/kernel/audit/routine-runs", async () => (await import("./testing/fakes")).routineRunsFake);
vi.mock("@/kernel/messaging/lark", async () => (await import("./testing/fakes")).larkFake);
vi.mock("./store", async () => (await import("./testing/fakes")).storeFake);
vi.mock("../active-clients", async () => (await import("./testing/fakes")).activeClientsFake);
vi.mock("../reads", async () => (await import("./testing/fakes")).readsFake);
vi.mock("./draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./draft")>()),
  draftNarrative: async () => ({ ok: false, error: "credit balance too low" }),
}));

const { driveAgents } = await import("@/kernel/audit/step-driver");
const { clientStatusDriven } = await import("./run-step");
const { draftAgain } = await import("./review");
const { openReports } = await import("./testing/fakes").then((m) => m.storeFake);

const deps = { readBoard: async () => board(), origin: async () => "https://edge8.test" };

beforeEach(() => {
  resetFakes();
  runs.failures = [];
  db.clients.set(CO_A, { company: ACME, programIds: ["p-a"] });
  db.roadmap.push(...roadmap());
});

describe("the tick driver on a weekly client status", () => {
  it("advances one step per tick, backs off a failure, and stops after three with the last error", async () => {
    await openReports([CO_A], WEEK);
    const report = () => db.reports[0];
    const now = new Date("2026-10-09T04:00:00Z");

    let out = await driveAgents([clientStatusDriven(deps)], now);
    expect(out[0]).toMatchObject({ action: "advanced", step: "gather" });
    expect(report().step).toBe("draft");

    // One failure a minute ago: the driver waits out its five minutes.
    runs.failures = [{ started_at: "2026-10-09T03:59:00Z", error: "credit balance too low", summary: null }];
    out = await driveAgents([clientStatusDriven(deps)], now);
    expect(out[0]).toMatchObject({ action: "waiting", step: "draft" });

    // Three failures on record: no fourth attempt; the report stops, saying why.
    runs.failures = [1, 2, 3].map((i) => ({ started_at: `2026-10-09T03:0${i}:00Z`, error: "the model could not draft: credit balance too low", summary: null }));
    out = await driveAgents([clientStatusDriven(deps)], now);
    expect(out[0]).toMatchObject({ action: "gave-up", step: "draft" });
    expect(report()).toMatchObject({ step: "stopped", error: expect.stringContaining("credit balance too low") });
    expect(await driveAgents([clientStatusDriven(deps)], now)).toEqual([]);

    // Retry: a fresh epoch, from draft (the facts are there), run at once.
    const epoch = report().startedAt;
    runs.failures = [];
    expect(await draftAgain(report().id, deps)).toEqual({ ok: true });
    expect(report().startedAt).not.toBe(epoch);
    expect(report()).toMatchObject({ step: "draft", error: null });
  });
});
