import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The run row opens at the start (Y.6) and its status is explicit (Y.34).
// recordRoutineRun claims the tick through claim_tick before the handler runs,
// so a run that is killed leaves a `running` row the reaper can find, and a
// second invocation of the same tick loses the claim instead of running the
// work twice. The row is closed by a fenced update that only touches a row
// still running or waiting, so a late close after the reaper cannot overwrite
// `died`. Status is what the handler said, never inferred from counters: a
// body with a `skipped` counter is an ok run (the 804 mislabelled email runs).

type Row = Record<string, unknown> & { id: string; status: string };
const rows: Row[] = [];
const events: string[] = [];
let claimError: { message: string } | null = null;
let seq = 0;

// A small in-memory routine_runs table: claim_tick honours the partial unique
// index, and update applies eq/in filters the way PostgREST would.
function claimTick(args: Record<string, unknown>) {
  events.push("claim");
  if (claimError) return { data: null, error: claimError };
  const live = ["running", "waiting", "ok", "skipped"];
  const taken = rows.some(
    (r) => r.routine_id === args.p_routine && r.tick_key === args.p_tick && r.mode === args.p_mode && live.includes(r.status),
  );
  if (taken) return { data: null, error: null };
  const id = `run-${++seq}`;
  const now = Date.now();
  rows.push({
    id,
    routine_id: args.p_routine,
    tick_key: args.p_tick,
    mode: args.p_mode,
    host: args.p_host,
    status: "running",
    started_at: new Date(now).toISOString(),
    step_deadline_at: new Date(now + Number(args.p_step_s) * 1000).toISOString(),
  });
  return { data: id, error: null };
}

function updateChain(patch: Record<string, unknown>) {
  const filters: ((r: Row) => boolean)[] = [];
  const chain = {
    eq(col: string, v: unknown) {
      filters.push((r) => r[col] === v);
      return chain;
    },
    in(col: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[col]));
      return chain;
    },
    lt(col: string, v: string) {
      filters.push((r) => typeof r[col] === "string" && Date.parse(r[col] as string) < Date.parse(v));
      return chain;
    },
    async select() {
      events.push("close");
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      for (const r of hit) Object.assign(r, patch);
      return { data: hit.map((r) => ({ ...r })), error: null };
    },
  };
  return chain;
}

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "claim_tick") throw new Error(`unexpected rpc ${fn}`);
      return claimTick(args);
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        events.push("insert");
        const id = `run-${++seq}`;
        rows.push({ ...row, id } as Row);
        return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
      },
      update: (patch: Record<string, unknown>) => updateChain(patch),
    }),
  },
}));

const notifyOps = vi.fn(async (_text: string) => true);
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: (text: string) => notifyOps(text) }));

const { recordRoutineRun, withRoutineRun } = await import("@/kernel/audit/routine-runs");
const { reapDiedRuns } = await import("@/kernel/audit/routine-reaper");

beforeEach(() => {
  rows.length = 0;
  events.length = 0;
  claimError = null;
  notifyOps.mockClear();
});

describe("recordRoutineRun opens the row at the start", () => {
  it("claims the tick before the handler runs and closes the same row after", async () => {
    await recordRoutineRun(
      "/api/cron/thing/",
      async () => {
        events.push("handler");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: "running", tick_key: "2026-09-28", mode: "live", host: "vercel" });
        return Response.json({ sent: 2 });
      },
      "vercel",
      { tick: "2026-09-28" },
    );
    expect(events).toEqual(["claim", "handler", "close"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ok", summary: "sent 2", result: { sent: 2 } });
  });

  it("runs the handler exactly once when two invocations claim the same tick", async () => {
    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return Response.json({ sent: 1 });
    });
    const [a, b] = await Promise.all([
      recordRoutineRun("/api/cron/thing/", handler, "vercel", { tick: "2026-09-28" }),
      recordRoutineRun("/api/cron/thing/", handler, "vercel", { tick: "2026-09-28" }),
    ]);
    expect(handler).toHaveBeenCalledTimes(1);
    const bodies = [await a.json(), await b.json()];
    expect(bodies).toContainEqual({ status: "skipped", reason: "tick-taken" });
    expect(rows).toHaveLength(1);
  });

  it("claims a fresh tick for each call that names none, so buttons never collide", async () => {
    const handler = vi.fn(async () => Response.json({ sent: 1 }));
    await recordRoutineRun("/api/cron/thing/", handler);
    await recordRoutineRun("/api/cron/thing/", handler);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(rows[0].tick_key).not.toBe(rows[1].tick_key);
  });

  it("lets an errored tick be claimed again", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => Response.json({ error: "boom" }, { status: 500 }), "vercel", { tick: "t1" });
    const retry = vi.fn(async () => Response.json({ sent: 1 }));
    await recordRoutineRun("/api/cron/thing/", retry, "vercel", { tick: "t1" });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.status)).toEqual(["error", "ok"]);
  });
});

describe("the status is explicit", () => {
  it("records a body with a skipped counter as ok", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => Response.json({ skipped: 0, sent: 3 }));
    expect(rows[0].status).toBe("ok");
  });

  it("records ok: false with a 200 as ok, since only the handler's status says skipped", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => Response.json({ ok: false, note: "x" }));
    expect(rows[0].status).toBe("ok");
  });

  it("records status skipped as skipped, with its reason in the summary", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => Response.json({ status: "skipped", reason: "GH_PAT not configured" }));
    expect(rows[0]).toMatchObject({ status: "skipped", summary: "reason GH_PAT not configured" });
  });

  it("records a non-2xx response as error", async () => {
    await recordRoutineRun("/api/cron/thing/", async () => Response.json({ error: "db down" }, { status: 500 }));
    expect(rows[0]).toMatchObject({ status: "error", error: "db down" });
  });

  it("records a thrown handler as error and returns a 500", async () => {
    const res = await recordRoutineRun("/api/cron/thing/", async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect(rows[0]).toMatchObject({ status: "error", summary: "Error: boom" });
    expect(String(rows[0].error)).toContain("boom");
  });
});

describe("the close is fenced", () => {
  it("changes nothing when the reaper marked the run died first, and logs the late result", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await recordRoutineRun(
      "/api/cron/thing/",
      async () => {
        rows[0].status = "died"; // the reaper got there while the handler ran
        return Response.json({ sent: 4 });
      },
      "vercel",
      { tick: "t1" },
    );
    expect(res.status).toBe(200);
    expect(rows[0].status).toBe("died");
    expect(rows[0].result).toBeUndefined();
    expect(warn.mock.calls.flat().join(" ")).toMatch(/late result/);
    warn.mockRestore();
  });
});

describe("the reaper", () => {
  const minutes = (n: number) => new Date(Date.now() + n * 60_000);

  it("turns a run that was killed before it closed into died, after its deadline and the grace minute", async () => {
    // A handler that never returns stands in for a function Vercel killed.
    void recordRoutineRun("/api/cron/thing/", () => new Promise<Response>(() => {}), "vercel", { tick: "t1", stepSeconds: 60 });
    await new Promise((r) => setTimeout(r, 0));
    expect(rows[0].status).toBe("running");

    // Inside the step deadline plus sixty seconds nothing is touched.
    expect(await reapDiedRuns(minutes(1.5))).toMatchObject({ died: [] });
    expect(rows[0].status).toBe("running");

    const reaped = await reapDiedRuns(minutes(3));
    expect(reaped).toEqual({ died: [expect.objectContaining({ id: rows[0].id })], alerted: true });
    expect(rows[0]).toMatchObject({ status: "died" });
    expect(notifyOps).toHaveBeenCalledTimes(1);
    expect(String(notifyOps.mock.calls[0]?.[0])).toContain("/api/cron/thing/");
  });

  it("never reaps a waiting run, however old", async () => {
    rows.push({ id: "w1", routine_id: "/api/cron/thing/", status: "waiting", step_deadline_at: minutes(-600).toISOString() });
    expect(await reapDiedRuns()).toMatchObject({ died: [] });
    expect(rows[0].status).toBe("waiting");
    expect(notifyOps).not.toHaveBeenCalled();
  });

  it("frees the tick of a died run for a retry", async () => {
    rows.push({ id: "d1", routine_id: "/api/cron/thing/", tick_key: "t1", mode: "live", status: "died" });
    const retry = vi.fn(async () => Response.json({ sent: 1 }));
    await recordRoutineRun("/api/cron/thing/", retry, "vercel", { tick: "t1" });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("withRoutineRun claims the cron's schedule slot", () => {
  // Vercel Cron's own delivery: a GET with the bearer and the header naming the
  // expression that fired it (Vercel docs, "Managing Cron Jobs"). Only this
  // belongs to a schedule slot.
  const delivery = (schedule: string) =>
    new Request("https://example.test/api/cron/x", {
      headers: { authorization: "Bearer lifecycle-secret", "x-vercel-cron-schedule": schedule, "user-agent": "vercel-cron/1.0" },
    });
  // The runbook's "Running one by hand": the same GET with the bearer, sent by curl.
  const curl = () => new Request("https://example.test/api/cron/x", { headers: { authorization: "Bearer lifecycle-secret" } });
  const manualPost = () =>
    new Request("https://example.test/api/cron/x", { method: "POST", headers: { authorization: "Bearer lifecycle-secret" } });
  const clock = (iso: string) => vi.setSystemTime(new Date(iso));

  let previousSecret: string | undefined;
  beforeEach(() => {
    previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "lifecycle-secret";
    // A fixed clock, so a redelivery cannot land in the next slot.
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("keys Vercel's delivery by its slot, so a second delivery of the same slot does not run", async () => {
    clock("2026-09-28T01:15:20Z");
    const handler = vi.fn(async () => Response.json({ sent: 1 }));
    // board-digest is daily in vercel.json, so its tick is a date.
    await withRoutineRun("/api/cron/board-digest/", delivery("15 1 * * *"), handler);
    const again = await withRoutineRun("/api/cron/board-digest/", delivery("15 1 * * *"), handler);
    expect(await again.json()).toEqual({ status: "skipped", reason: "tick-taken" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].tick_key).toBe("2026-09-28");
  });

  it("runs the runbook's curl the day after a monthly slot's run skipped, and records it as a new row", async () => {
    // marketing-recap fires at 00:30 on the 4th. The model call failed, so the
    // handler skipped, and that skipped row holds the slot "2026-10-04".
    const recap = vi.fn(async () => Response.json({ status: "skipped", reason: "no broadcasts to recap or AI unavailable" }));
    clock("2026-10-04T00:30:40Z");
    await withRoutineRun("/api/cron/marketing-recap/", delivery("30 0 4 * *"), recap);
    expect(rows[0]).toMatchObject({ status: "skipped", tick_key: "2026-10-04" });

    // On the 5th the latest slot is still the 4th's; the curl must run anyway.
    recap.mockImplementation(async () => Response.json({ stored: true, emailed: 1 }));
    clock("2026-10-05T03:00:00Z");
    const res = await withRoutineRun("/api/cron/marketing-recap/", curl(), recap);
    expect(await res.json()).toEqual({ stored: true, emailed: 1 });
    expect(recap).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.status)).toEqual(["skipped", "ok"]);
    expect(rows[1].tick_key).not.toBe("2026-10-04");
  });

  it("runs the curl inside the same week after a weekly slot's run skipped", async () => {
    // weekly-sprints fires Monday 01:00; its tick is the ISO week.
    const sprints = vi.fn(async () => Response.json({ status: "skipped", reason: "no board has weekly sprints switched on" }));
    clock("2026-09-28T01:00:10Z");
    await withRoutineRun("/api/cron/weekly-sprints/", delivery("0 1 * * 1"), sprints);
    expect(rows[0]).toMatchObject({ status: "skipped", tick_key: "2026-W40" });

    // An admin switched sprints on; the re-run on Tuesday opens Wednesday's sprint.
    sprints.mockImplementation(async () => Response.json({ opened: 1 }));
    clock("2026-09-29T08:00:00Z");
    const res = await withRoutineRun("/api/cron/weekly-sprints/", curl(), sprints);
    expect(await res.json()).toEqual({ opened: 1 });
    expect(sprints).toHaveBeenCalledTimes(2);
    expect(rows.map((r) => r.status)).toEqual(["skipped", "ok"]);
  });

  it("runs every curl, each with a tick of its own, and still refuses Vercel's redelivery", async () => {
    clock("2026-09-28T09:00:00Z");
    const handler = vi.fn(async () => Response.json({ sent: 1 }));
    await withRoutineRun("/api/cron/board-digest/", delivery("15 1 * * *"), handler);
    await withRoutineRun("/api/cron/board-digest/", curl(), handler);
    await withRoutineRun("/api/cron/board-digest/", curl(), handler);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(new Set(rows.map((r) => r.tick_key)).size).toBe(3);
    const redelivered = await withRoutineRun("/api/cron/board-digest/", delivery("15 1 * * *"), handler);
    expect(await redelivered.json()).toEqual({ status: "skipped", reason: "tick-taken" });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("gives a manual POST to a scheduled route a tick of its own, so it runs after the slot's run", async () => {
    const handler = vi.fn(async () => Response.json({ sent: 1 }));
    clock("2026-09-28T09:00:00Z");
    // htt-refresh-summaries runs at 23:40 in vercel.json: Vercel's GET takes the night's slot.
    await withRoutineRun("/api/cron/htt-refresh-summaries/", delivery("40 23 * * *"), handler);
    const first = await withRoutineRun("/api/cron/htt-refresh-summaries/", manualPost(), handler);
    const second = await withRoutineRun("/api/cron/htt-refresh-summaries/", manualPost(), handler);
    expect(await first.json()).toEqual({ sent: 1 });
    expect(await second.json()).toEqual({ sent: 1 });
    expect(handler).toHaveBeenCalledTimes(3);
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    expect(rows[0].tick_key).toBe("2026-09-27");
    expect(rows[1].tick_key).not.toBe("2026-09-27");
    expect(rows[2].tick_key).not.toBe("2026-09-27");
    expect(rows[1].tick_key).not.toBe(rows[2].tick_key);

    // The slot itself is still claimed once: a second delivery of the GET does not run.
    const redelivered = await withRoutineRun("/api/cron/htt-refresh-summaries/", delivery("40 23 * * *"), handler);
    expect(await redelivered.json()).toEqual({ status: "skipped", reason: "tick-taken" });
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("gives an on-demand route a fresh tick per call", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    await withRoutineRun("/api/cron/writer-agent/", curl(), handler);
    await withRoutineRun("/api/cron/writer-agent/", curl(), handler);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe("before the migration lands", () => {
  it("still runs the handler and writes one closed row when claim_tick fails", async () => {
    claimError = { message: "Could not find the function company_os.claim_tick" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => Response.json({ sent: 1 }));
    await recordRoutineRun("/api/cron/thing/", handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["claim", "insert"]);
    expect(rows[0]).toMatchObject({ status: "ok", summary: "sent 1" });
    expect(rows[0]).not.toHaveProperty("tick_key");
    error.mockRestore();
  });
});
