import { beforeEach, describe, expect, it, vi } from "vitest";

// How a run moves, tested once for every chain on the loop (A.2): since Y.12
// no step hands the run on: a passing step returns and the tick driver takes
// the next one; a run that parks or stops tells its channel once; a skipped
// tick does neither. A person's button runs the step the run is at under that
// step's tick (step-now.ts, A.43), and the driver stops a run it gave up on with
// the chain's own stop. The chain under test is a stub definition, so the words
// a chain chooses are not this suite's concern; each chain's tests pin its own.

const recorded: { routineId: string; opts: unknown }[] = [];
const recorder = vi.hoisted(() => ({ notRun: null as { reason: string; detail?: string } | null, runId: null as string | null }));
// The switch, scripted at its read; the rule that turns it into a decision is
// the real one (run-mode.ts), so the button is tested against what the driver
// and the recorder decide.
const sw = vi.hoisted(() => ({ read: { ok: true, mode: "live", reason: null } as { ok: true; mode: "live" | "shadow" | "paused"; reason: string | null } | { ok: false; error: string } }));
vi.mock("./routine-config", () => ({ readRoutineMode: async () => sw.read }));
vi.mock("./routine-runs", async () => {
  const { runStore } = await import("./run-context");
  const { decideRunMode } = await vi.importActual<typeof import("./run-mode")>("./run-mode");
  return {
    decideRunMode,
    recordRoutineRun: async (routineId: string, handler: () => Promise<Response>, _host: string, opts: unknown) => {
      recorded.push({ routineId, opts });
      // The recorder's answer when it does not run the step (Z.17): a held tick, or the switch.
      if (recorder.notRun) return Response.json({ status: "skipped", ...recorder.notRun });
      const ctx = { routineId, runId: recorder.runId, mode: "live" as const, aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] };
      return runStore().run(ctx, handler);
    },
  };
});
// The release of a waiting step's tick: the one write step-now.ts makes itself.
const released = vi.hoisted(() => ({ calls: [] as { patch: unknown; eqs: [string, unknown][] }[], error: null as { message: string } | null }));
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => {
      if (table !== "routine_runs") throw new Error(`unscripted table ${table}`);
      return {
        update: (patch: unknown) => {
          const call = { patch, eqs: [] as [string, unknown][] };
          released.calls.push(call);
          const chain = {
            eq: (col: string, v: unknown) => (call.eqs.push([col, v]), chain),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: released.error }).then(resolve),
          };
          return chain;
        },
      };
    },
  },
}));

const { runLoop } = await import("./run-loop");
const { runStepNow, tickResponse, whyNotRun } = await import("./step-now");
const { runStore } = await import("./run-context");

type Step = "one" | "two";
type State = Step | "parked";
const notify = vi.fn(async (_text: string) => undefined);
const advance = vi.fn<(id: string) => Promise<import("./run-loop").StepResult<Step, State>>>();
const current = vi.fn(async (id: string) => ({ id, epoch: "2026-10-08T00:00:00Z", step: "one" }) as { id: string; epoch: string; step: string } | null);
const stop = vi.fn(async (_id: string, _step: Step, _error: string) => undefined);
const definition = {
  routineId: "/api/cron/stub-agent/",
  stepSeconds: 300,
  advance,
  current,
  dueRuns: async () => [],
  stop,
  parked: (r: { next: State; summary: string }) => (r.next === "parked" ? `parked: ${r.summary}` : null),
  stopped: (r: { step: Step; error: string }) => `stopped at ${r.step}: ${r.error}`,
  notify,
};
const loop = runLoop<Step, State>(definition);

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  stop.mockClear();
  recorded.length = 0;
  recorder.notRun = null;
  recorder.runId = null;
  released.calls.length = 0;
  released.error = null;
  sw.read = { ok: true, mode: "live", reason: null };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("run", () => {
  it("returns after a pass and tells nobody: the driver takes the next step", async () => {
    advance.mockResolvedValue({ ok: true, id: "c1", step: "one", next: "two", summary: "Done one." });
    const r = await loop.run("c1");
    expect(r).toMatchObject({ ok: true, next: "two" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells the channel once when the run parks", async () => {
    advance.mockResolvedValue({ ok: true, id: "c1", step: "two", next: "parked", summary: "All good." });
    await loop.run("c1");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("parked: All good.");
  });

  it("tells the channel once when a step's check fails", async () => {
    advance.mockResolvedValue({ ok: false, id: "c1", step: "one", error: "Contains an em dash." });
    await loop.run("c1");
    expect(notify).toHaveBeenCalledWith("stopped at one: Contains an em dash.");
  });

  it("does nothing more on a skipped tick", async () => {
    advance.mockResolvedValue({ skipped: "No run on this campaign.", id: "c1" });
    expect(await loop.run("c1")).toMatchObject({ skipped: "No run on this campaign." });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("runNow", () => {
  it("records the step under its own tick, so the driver never runs it twice", async () => {
    advance.mockResolvedValue({ ok: true, id: "c1", step: "one", next: "two", summary: "Done one." });
    const r = await loop.runNow("c1");
    expect(r).toMatchObject({ ok: true, step: "one" });
    expect(recorded).toEqual([
      { routineId: "/api/cron/stub-agent/", opts: { tick: "c1:2026-10-08T00:00:00Z:one", stepSeconds: 300, shadowCapable: false, decided: { mode: "live" } } },
    ]);
  });

  it("passes the chain's shadow declaration to the button's run and the driver alike (Z.17)", async () => {
    const shadowLoop = runLoop<Step, State>({ ...definition, parked: () => null, stopped: () => "", shadow: true });
    advance.mockResolvedValue({ ok: true, id: "c1", step: "one", next: "two", summary: "Done one." });
    await shadowLoop.runNow("c1");
    expect(recorded[0].opts).toMatchObject({ shadowCapable: true });
    expect(shadowLoop.driven.shadow).toBe(true);
    expect(loop.driven.shadow).toBe(false);
  });

  it("says why a step the recorder did not run was not run", async () => {
    recorder.notRun = { reason: "tick-taken" };
    expect(await loop.runNow("c1")).toEqual({ skipped: "The step is already running.", id: "c1" });
    recorder.notRun = { reason: "set to shadow, which this routine does not support; nothing was run" };
    expect(await loop.runNow("c1")).toEqual({ skipped: "Not run: set to shadow, which this routine does not support; nothing was run.", id: "c1" });
    expect(advance).not.toHaveBeenCalled();
  });

  it("runs nothing when the run is not at a step", async () => {
    current.mockResolvedValueOnce(null);
    const r = await loop.runNow("c1");
    expect(r).toMatchObject({ skipped: "The run is not at a step." });
    expect(advance).not.toHaveBeenCalled();
  });
});

describe("driven", () => {
  it("answers a driver's step as the recorder reads it", async () => {
    advance.mockResolvedValue({ ok: false, id: "c1", step: "one", error: "too short" });
    const res = await loop.driven.runStep("c1");
    expect(res.status).toBe(422);
  });

  it("stops a run the driver gave up on, with the chain's own stop, and tells the channel", async () => {
    await loop.driven.giveUp("c1", "two", "Stopped after 3 failed attempts.");
    expect(stop).toHaveBeenCalledWith("c1", "two", "Stopped after 3 failed attempts.");
    expect(notify).toHaveBeenCalledWith("stopped at two: Stopped after 3 failed attempts.");
  });
});

// How a step is recorded inside its claimed tick (Y.34, Y.12 review): a failed
// check is a non-2xx, so it records as an error; a passing step is a plain 200.
describe("tickResponse", () => {
  it("answers a failed check with a 422, so the run records as an error", async () => {
    const res = await tickResponse({ ok: false, id: "c1", step: "draft", error: "too short" } as never);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "too short" });
  });

  it("answers a passing step with a plain 200", async () => {
    const res = await tickResponse({ ok: true, id: "c1", step: "draft", next: "edit", summary: "drafted c1" } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("status");
  });
});

// Y.12 review: a step with nothing to do inside a claimed tick must not close
// the tick as skipped, or claim_tick refuses it for good and the run sticks.
describe("a skip inside a claimed tick", () => {
  it("records as an error that says why, so the tick stays free", async () => {
    advance.mockResolvedValue({ skipped: "Could not read the campaign.", id: "c1" });
    const res = await loop.driven.runStep("c1");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Nothing run: Could not read the campaign." });
  });
});

// A.43: the button, written once. Its four answers, each from what actually
// happened: the step's own result, or the recorder's answer when it did not run.
describe("runStepNow", () => {
  type Answer = { ok: true; id: string; summary: string } | { ok: false; id: string; error: string } | { skipped: string; id: string } | { waiting: string; id: string };
  const step = vi.fn<(id: string) => Promise<Answer>>();
  const chain = { routineId: "/api/cron/stub-chain/", stepSeconds: 60, shadow: true, current, advance: step };
  beforeEach(() => step.mockReset());
  const waits: Answer = { waiting: "The chain is in shadow.", id: "r1" };

  it("ran: the step's own result, a failure included, which the driver retries", async () => {
    step.mockResolvedValueOnce({ ok: true, id: "r1", summary: "Gathered." });
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "ran", result: { ok: true, id: "r1", summary: "Gathered." } });
    step.mockResolvedValueOnce({ ok: false, id: "r1", error: "model down" });
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "ran", result: { ok: false, id: "r1", error: "model down" } });
    expect(recorded[0]).toEqual({ routineId: "/api/cron/stub-chain/", opts: { tick: "r1:2026-10-08T00:00:00Z:one", stepSeconds: 60, shadowCapable: true, decided: { mode: "live" } } });
  });

  it("waiting: a step that waits for the switch is not a failure and keeps no tick", async () => {
    recorder.runId = "run-1";
    step.mockResolvedValueOnce({ waiting: "The chain is in shadow.", id: "r1" });
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "waiting", why: "The chain is in shadow." });
    // The claimed row lets its tick go before it closes, so the live step it waits for can claim it later.
    expect(released.calls).toEqual([{ patch: { tick_key: null }, eqs: [["id", "run-1"], ["status", "running"]] }]);
    const res = await tickResponse(waits);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "skipped", reason: "The chain is in shadow." });
  });

  it("waiting whose tick could not be released records as an error, never as a held tick", async () => {
    recorder.runId = "run-2";
    released.error = { message: "connection reset" };
    const res = await runStore().run({ routineId: "x", runId: "run-2", mode: "shadow", aiCalls: 0, aiInput: 0, aiOutput: 0, aiCacheRead: 0, aiCacheWrite: 0, withheld: [] }, () =>
      tickResponse(waits),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("connection reset") });
  });

  it("held: names the holder the recorder gave, and runs nothing", async () => {
    recorder.notRun = { reason: "tick-taken", detail: "a shadow run holds this tick" };
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "held", holder: "Not run: a shadow run holds this tick." });
    recorder.notRun = { reason: "tick-taken" };
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "held", holder: "The step is already running." });
    expect(step).not.toHaveBeenCalled();
  });

  it("refused: not at a step, a switch that says not to run, or a step with nothing to do", async () => {
    current.mockResolvedValueOnce(null);
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "refused", error: "The run is not at a step." });
    recorder.notRun = { reason: "the switch could not be read" };
    expect(await runStepNow(chain, "r1")).toEqual({ kind: "refused", error: "Not run: the switch could not be read." });
    recorder.notRun = null;
    step.mockResolvedValueOnce({ skipped: "No such proposal.", id: "r1" });
    const out = await runStepNow(chain, "r1");
    expect(out).toEqual({ kind: "refused", error: "No such proposal." });
    expect(out.kind !== "ran" && whyNotRun(out)).toBe("No such proposal.");
  });

  // A.49: the switch is read before the tick is claimed, as the driver reads it.
  // A refusal opens no row and claims nothing, so the tick stays free for the
  // driver and for the next press; the recorder used to claim it and close it
  // skipped, which claim_tick then refuses for good.
  describe("the switch is decided before the tick is claimed", () => {
    it("a switch that cannot be read refuses a shadow chain's step without calling the recorder", async () => {
      sw.read = { ok: false, error: "routine_config unreachable" };
      expect(await runStepNow(chain, "r1")).toEqual({ kind: "refused", error: "Not run: the switch could not be read." });
      expect(recorded).toEqual([]);
      expect(step).not.toHaveBeenCalled();
    });

    it("a shadow switch on a chain that cannot run in shadow refuses without calling the recorder", async () => {
      sw.read = { ok: true, mode: "shadow", reason: null };
      const out = await runStepNow({ ...chain, shadow: false }, "r1");
      expect(out).toEqual({ kind: "refused", error: "Not run: set to shadow, which this routine does not support; nothing was run." });
      expect(recorded).toEqual([]);
    });

    it("a live switch claims the tick as before, with the mode it decided", async () => {
      step.mockResolvedValueOnce({ ok: true, id: "r1", summary: "Gathered." });
      expect(await runStepNow(chain, "r1")).toMatchObject({ kind: "ran" });
      expect(recorded).toEqual([{ routineId: "/api/cron/stub-chain/", opts: expect.objectContaining({ tick: "r1:2026-10-08T00:00:00Z:one", decided: { mode: "live" } }) }]);
    });

    it("a shadow switch still runs a shadow chain's step, in shadow", async () => {
      sw.read = { ok: true, mode: "shadow", reason: null };
      step.mockResolvedValueOnce({ ok: true, id: "r1", summary: "Gathered." });
      expect(await runStepNow(chain, "r1")).toMatchObject({ kind: "ran" });
      expect(recorded[0].opts).toMatchObject({ decided: { mode: "shadow" } });
    });

    it("a paused switch still runs the step a person asked for, live (Y.25)", async () => {
      sw.read = { ok: true, mode: "paused", reason: "holiday" };
      step.mockResolvedValueOnce({ ok: true, id: "r1", summary: "Gathered." });
      expect(await runStepNow(chain, "r1")).toMatchObject({ kind: "ran" });
      expect(recorded[0].opts).toMatchObject({ decided: { mode: "live" } });
    });
  });
});
