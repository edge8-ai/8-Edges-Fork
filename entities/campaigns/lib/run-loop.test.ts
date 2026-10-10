import { beforeEach, describe, expect, it, vi } from "vitest";

// How a run moves, tested once for every agent (A.2). Since Y.12 no step hands
// the run on: a passing step returns and the tick driver takes the next one; a
// run that parks or stops tells ops once; a skipped tick does neither. A
// person's button runs the step the run is at under that step's tick, and the
// driver stops a run it gave up on with the agent's own stop. The agent under
// test is a stub definition, so the words an agent chooses are not this
// suite's concern; each agent's run-step test pins its own.

const notify = vi.fn(async (_text: string) => undefined);
vi.mock("@/kernel/messaging/lark", () => ({ notifyMarketing: (t: string) => notify(t) }));
const recorded: { routineId: string; opts: unknown }[] = [];
vi.mock("@/kernel/audit/routine-runs", () => ({
  recordRoutineRun: async (routineId: string, handler: () => Promise<Response>, _host: string, opts: unknown) => {
    recorded.push({ routineId, opts });
    // The recorder's answer when it does not run the step (Z.17): a held tick, or the switch.
    if (notRun.reason) return Response.json({ status: "skipped", reason: notRun.reason });
    return handler();
  },
}));
const notRun = vi.hoisted(() => ({ reason: null as string | null }));
const fetchMock = vi.fn(async () => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

const { agentRunLoop, stepResponse } = await import("./run-loop");

type Step = "one" | "two";
type State = Step | "parked";
const advance = vi.fn<(id: string) => Promise<import("./run-loop").StepResult<Step, State>>>();
const current = vi.fn(async (id: string) => ({ id, epoch: "2026-10-08T00:00:00Z", step: "one" }) as { id: string; epoch: string; step: string } | null);
const stop = vi.fn(async (_id: string, _step: Step, _error: string) => undefined);
const loop = agentRunLoop<Step, State>({
  tag: "stub",
  routineId: "/api/cron/stub-agent/",
  stepSeconds: 300,
  advance,
  current,
  dueRuns: async () => [],
  stop,
  parked: (r) => (r.next === "parked" ? `parked: ${r.summary}` : null),
  stopped: (r) => `stopped at ${r.step}: ${r.error}`,
});

beforeEach(() => {
  advance.mockReset();
  notify.mockClear();
  fetchMock.mockClear();
  stop.mockClear();
  recorded.length = 0;
  notRun.reason = null;
});

describe("run", () => {
  it("returns after a pass and calls nothing over HTTP: the driver takes the next step", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "one", next: "two", summary: "Done one." });
    const r = await loop.run("c1");
    expect(r).toMatchObject({ ok: true, next: "two" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("tells ops once when the run parks", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "two", next: "parked", summary: "All good." });
    await loop.run("c1");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("parked: All good.");
  });

  it("tells ops once when a step's check fails", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "c1", step: "one", error: "Contains an em dash." });
    await loop.run("c1");
    expect(notify).toHaveBeenCalledWith("stopped at one: Contains an em dash.");
  });

  it("does nothing more on a skipped tick", async () => {
    advance.mockResolvedValue({ skipped: "No run on this campaign.", campaignId: "c1" });
    expect(await loop.run("c1")).toMatchObject({ skipped: "No run on this campaign." });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("runNow", () => {
  it("records the step under its own tick, so the driver never runs it twice", async () => {
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "one", next: "two", summary: "Done one." });
    const r = await loop.runNow("c1");
    expect(r).toMatchObject({ ok: true, step: "one" });
    expect(recorded).toEqual([
      { routineId: "/api/cron/stub-agent/", opts: { tick: "c1:2026-10-08T00:00:00Z:one", stepSeconds: 300, shadowCapable: false } },
    ]);
  });

  it("passes the agent's shadow declaration to the button's run and the driver alike (Z.17)", async () => {
    const shadowLoop = agentRunLoop<Step, State>({
      tag: "stub",
      routineId: "/api/cron/stub-agent/",
      stepSeconds: 300,
      advance,
      current,
      dueRuns: async () => [],
      stop,
      parked: () => null,
      stopped: () => "",
      shadow: true,
    });
    advance.mockResolvedValue({ ok: true, campaignId: "c1", step: "one", next: "two", summary: "Done one." });
    await shadowLoop.runNow("c1");
    expect(recorded[0].opts).toMatchObject({ shadowCapable: true });
    expect(shadowLoop.driven.shadow).toBe(true);
    expect(loop.driven.shadow).toBe(false);
  });

  it("says why a step the recorder did not run was not run", async () => {
    notRun.reason = "tick-taken";
    expect(await loop.runNow("c1")).toEqual({ skipped: "The step is already running.", campaignId: "c1" });
    notRun.reason = "set to shadow, which this routine does not support; nothing was run";
    expect(await loop.runNow("c1")).toEqual({ skipped: "Not run: set to shadow, which this routine does not support; nothing was run.", campaignId: "c1" });
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
  it("answers a driver's step as a step route would", async () => {
    advance.mockResolvedValue({ ok: false, campaignId: "c1", step: "one", error: "too short" });
    const res = await loop.driven.runStep("c1");
    expect(res.status).toBe(422);
  });

  it("stops a run the driver gave up on, with the agent's own stop, and tells ops", async () => {
    await loop.driven.giveUp("c1", "two", "Stopped after 3 failed attempts.");
    expect(stop).toHaveBeenCalledWith("c1", "two", "Stopped after 3 failed attempts.");
    expect(notify).toHaveBeenCalledWith("stopped at two: Stopped after 3 failed attempts.");
  });
});

// How a step is recorded (Y.34). The recorder no longer infers: a tick with
// nothing to do must say status skipped, and a failed check must be a non-2xx
// so it records as an error — it used to be filed as a quiet skip.
describe("stepResponse", () => {
  it("marks a step with nothing to do as skipped, with the reason", async () => {
    const res = stepResponse({ skipped: "no run on this campaign", campaignId: "c1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "skipped", reason: "no run on this campaign", campaignId: "c1" });
  });

  it("answers a failed check with a non-2xx, so the run records as an error", async () => {
    const res = stepResponse({ ok: false, campaignId: "c1", step: "draft", error: "too short" });
    expect(res.ok).toBe(false);
    expect(await res.json()).toMatchObject({ error: "too short" });
  });

  it("answers a passing step with a plain 200", async () => {
    const res = stepResponse({ ok: true, campaignId: "c1", step: "draft", next: "edit", summary: "drafted c1" });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("status");
  });
});

// Y.12 review: a step with nothing to do inside a claimed tick must not close
// the tick as skipped, or claim_tick refuses it for good and the run sticks.
describe("a skip inside a claimed tick", () => {
  it("records as an error that says why, so the tick stays free", async () => {
    advance.mockResolvedValue({ skipped: "Could not read the campaign.", campaignId: "c1" });
    const res = await loop.driven.runStep("c1");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "Nothing run: Could not read the campaign." });
  });
});
