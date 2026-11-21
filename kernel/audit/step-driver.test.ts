import { beforeEach, describe, expect, it, vi } from "vitest";

// The tick driver (Y.12): one step per due run per tick, each under its own
// tick; failures counted from the run log, backed off, and given up after
// MAX_ATTEMPTS; a tick another caller holds is left alone.

const failures = vi.hoisted(() => ({ rows: [] as { started_at: string; error: string | null; summary: string | null }[], error: null as { message: string } | null }));
const recorded: { routineId: string; opts: { tick: string; stepSeconds: number } }[] = [];
const claimTaken = vi.hoisted(() => ({ value: false }));
const paused = vi.hoisted(() => ({ value: null as string | null }));
const shadow = vi.hoisted(() => ({ value: false }));

vi.mock("@/kernel/data/supabase", () => {
  const b: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: failures.rows, error: failures.error }).then(resolve),
  };
  for (const op of ["select", "eq", "in", "order", "limit"]) b[op] = () => b;
  return { companyOs: { from: () => b } };
});
vi.mock("./routine-runs", () => ({
  // The switch, scripted: paused skips; shadow runs in shadow only for an
  // agent that declares it (the rule itself is tested in routine-runs.shadow.test.ts).
  decideRunMode: async (_routineId: string, opts: { honourPause: boolean; shadowCapable: boolean }) =>
    paused.value && opts.honourPause
      ? { skip: `paused: ${paused.value}` }
      : shadow.value && opts.shadowCapable
        ? { run: "shadow" }
        : { run: "live" },
  recordRoutineRun: async (routineId: string, handler: () => Promise<Response>, _host: string, opts: { tick: string; stepSeconds: number }) => {
    recorded.push({ routineId, opts });
    if (claimTaken.value) return Response.json({ status: "skipped", reason: "tick-taken" });
    return handler();
  },
}));

const { backoffMs, driveAgents, MAX_ATTEMPTS, stepTick } = await import("./step-driver");

const NOW = new Date("2026-10-08T12:00:00Z");
const run = { id: "c1", epoch: "2026-10-08T11:00:00Z", step: "draft" };

function agent(over: Partial<import("./step-driver").DrivenAgent> = {}) {
  return {
    routineId: "/api/cron/writer-agent/",
    stepSeconds: 300,
    dueRuns: vi.fn(async () => [run]),
    runStep: vi.fn(async () => Response.json({ ok: true })),
    giveUp: vi.fn(async () => undefined),
    ...over,
  };
}

beforeEach(() => {
  failures.rows = [];
  failures.error = null;
  recorded.length = 0;
  claimTaken.value = false;
  paused.value = null;
  shadow.value = false;
});

describe("stepTick and backoff", () => {
  it("keys a step by run, run start and step, so a restarted run reaches its first step anew", () => {
    expect(stepTick(run)).toBe("c1:2026-10-08T11:00:00Z:draft");
    expect(stepTick({ ...run, epoch: null })).toBe("c1:-:draft");
  });
  it("waits 5, 10, then 20 minutes", () => {
    expect([backoffMs(0), backoffMs(1), backoffMs(2), backoffMs(3)]).toEqual([0, 300_000, 600_000, 1_200_000]);
  });
});

describe("driveAgents", () => {
  it("advances a due run by one step under the step's tick", async () => {
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(a.runStep).toHaveBeenCalledWith("c1");
    expect(recorded).toEqual([
      { routineId: "/api/cron/writer-agent/", opts: { tick: "c1:2026-10-08T11:00:00Z:draft", stepSeconds: 300, shadowCapable: false, decided: { mode: "live" } } },
    ]);
    expect(out).toEqual([{ routineId: "/api/cron/writer-agent/", run: "c1", step: "draft", action: "advanced", detail: undefined }]);
  });

  it("runs the step in shadow when the switch says shadow and the agent declares it (Z.17)", async () => {
    shadow.value = true;
    await driveAgents([agent({ shadow: true })], NOW);
    expect(recorded[0].opts).toMatchObject({ decided: { mode: "shadow" } });
    recorded.length = 0;
    await driveAgents([agent()], NOW);
    expect(recorded[0].opts).toMatchObject({ decided: { mode: "live" } });
  });

  it("leaves a step a button is already running", async () => {
    claimTaken.value = true;
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(a.runStep).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ action: "waiting", detail: "the step is already running" });
  });

  it("backs off after a failure, then retries once the wait is over", async () => {
    failures.rows = [{ started_at: "2026-10-08T11:58:00Z", error: "timeout", summary: null }];
    const a = agent();
    expect((await driveAgents([a], NOW))[0]).toMatchObject({ action: "waiting" });
    expect(a.runStep).not.toHaveBeenCalled();
    failures.rows = [{ started_at: "2026-10-08T11:50:00Z", error: "timeout", summary: null }];
    expect((await driveAgents([a], NOW))[0]).toMatchObject({ action: "advanced" });
  });

  it("leaves a paused agent's runs alone without claiming their ticks", async () => {
    paused.value = "brand review this week";
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(recorded).toEqual([]);
    expect(out[0]).toMatchObject({ action: "waiting", detail: "paused: brand review this week" });
  });

  it("drives an agent that does not honour the pause past it (Z.11: runs already handed over)", async () => {
    paused.value = "chain off";
    const a = agent({ honourPause: false });
    const out = await driveAgents([a], NOW);
    expect(a.runStep).toHaveBeenCalledWith("c1");
    expect(out[0].action).toBe("advanced");
  });

  it("never gives up a step a person is running, because it gives up only inside a claim it won", async () => {
    failures.rows = Array.from({ length: MAX_ATTEMPTS }, () => ({ started_at: "2026-10-08T10:00:00Z", error: "rate limited", summary: null }));
    claimTaken.value = true;
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(a.giveUp).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ action: "waiting" });
  });

  it("gives up after MAX_ATTEMPTS failures, naming the last one", async () => {
    failures.rows = Array.from({ length: MAX_ATTEMPTS }, () => ({ started_at: "2026-10-08T10:00:00Z", error: "rate limited", summary: null }));
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(a.runStep).not.toHaveBeenCalled();
    expect(a.giveUp).toHaveBeenCalledWith("c1", "draft", `Stopped after ${MAX_ATTEMPTS} failed attempts at this step. Last: rate limited`);
    expect(out[0].action).toBe("gave-up");
  });

  it("reports a step whose failures cannot be counted, and runs nothing blind", async () => {
    failures.error = { message: "timeout" };
    const a = agent();
    const out = await driveAgents([a], NOW);
    expect(a.runStep).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ action: "unread", detail: "routine_runs: timeout" });
  });

  it("reports an agent whose runs cannot be listed, and still drives the others", async () => {
    const broken = agent({ routineId: "/api/cron/letter-agent/", dueRuns: vi.fn(async () => { throw new Error("email_campaigns: down"); }) });
    const fine = agent();
    const out = await driveAgents([broken, fine], NOW);
    expect(out.map((o) => o.action)).toEqual(["unread", "advanced"]);
  });
});
