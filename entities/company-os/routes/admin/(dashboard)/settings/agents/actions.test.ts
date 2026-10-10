import { beforeEach, describe, expect, it, vi } from "vitest";

// Y.25: the controls on Settings -> Agents. Each action asks for its declared
// permission first (ADR 0013), refuses a routine whose path does not honour
// the control, writes through the kernel and audits who did it. The kernel's
// writers are faked here; their own tests prove the SQL shape.

const requirePermission = vi.fn(async (_p: string) => ({ user: { email: "ana@example.test" }, personId: "person-1" }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: (p: string) => requirePermission(p) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const kernel = vi.hoisted(() => ({
  pause: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  resume: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  shadow: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  run: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, status: "ok" as "ok" | "skipped" | "error", summary: "posted 3" as string | null })),
  settle: vi.fn(async (..._a: unknown[]) => ({ ok: true as const, key: "ideas:nudge:p1:2026-W41", routineId: "/api/cron/ideas-digest/" })),
  audits: [] as Record<string, unknown>[],
}));
vi.mock("@/kernel/audit/routine-config", () => ({ PAUSE_REASON_MAX: 200, pauseRoutine: kernel.pause, resumeRoutine: kernel.resume, shadowRoutine: kernel.shadow }));
// No routine declares shadow yet (Z.17); one is made to here, the rest are the real registry.
const SHADOW_CAPABLE = "/api/cron/account-health/";
vi.mock("@/kernel/audit/automations.json", async (importOriginal) => {
  const real = (await importOriginal<{ default: { path: string }[] }>()).default;
  return { default: real.map((a) => (a.path === "/api/cron/account-health/" ? { ...a, shadow: true } : a)) };
});
vi.mock("@/kernel/audit/routine-entry-points", () => ({ runRoutineByHand: kernel.run }));
const latest = vi.hoisted(() => ({ value: new Map<string, { status: string }[]>() as Map<string, { status: string }[]> | Error }));
vi.mock("@/kernel/audit/routine-runs", () => ({
  recentRunsByRoutine: vi.fn(async () => {
    if (latest.value instanceof Error) throw latest.value;
    return latest.value;
  }),
}));
vi.mock("@/kernel/audit/effects", () => ({ settleUnknownEffect: kernel.settle }));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async (a: Record<string, unknown>) => void kernel.audits.push(a)) }));

const { turnRoutineOff, turnRoutineOn, turnRoutineShadow, runRoutineNow, settleSend } = await import("./actions");

const SCHEDULED = "/api/cron/ideas-digest/";
const EFFECT = "0b7c6a8e-2f43-4b1e-9a51-0c3f4f7e2a10";

beforeEach(() => {
  requirePermission.mockClear();
  for (const f of [kernel.pause, kernel.resume, kernel.shadow, kernel.run, kernel.settle]) f.mockClear();
  kernel.audits.length = 0;
  latest.value = new Map();
});

describe("every control", () => {
  it.each([
    ["turnRoutineOff", () => turnRoutineOff({ routineId: SCHEDULED, reason: "why" })],
    ["turnRoutineOn", () => turnRoutineOn({ routineId: SCHEDULED })],
    ["turnRoutineShadow", () => turnRoutineShadow({ routineId: SHADOW_CAPABLE })],
    ["runRoutineNow", () => runRoutineNow({ routineId: SCHEDULED })],
    ["settleSend", () => settleSend({ effectId: EFFECT, outcome: "done" })],
  ])("%s guards with company-os.routine-control before anything else", async (_name, call) => {
    requirePermission.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    expect(requirePermission).toHaveBeenCalledWith("company-os.routine-control");
    expect([kernel.pause, kernel.resume, kernel.shadow, kernel.run, kernel.settle].every((f) => f.mock.calls.length === 0)).toBe(true);
    expect(kernel.audits).toHaveLength(0);
  });
});

describe("the switch", () => {
  it("turns a routine off with its reason, as the signed-in person, and audits it", async () => {
    expect(await turnRoutineOff({ routineId: SCHEDULED, reason: " waiting on Y.22 " })).toEqual({ ok: true });
    expect(kernel.pause).toHaveBeenCalledWith(SCHEDULED, "waiting on Y.22", "person-1");
    expect(kernel.audits[0]).toMatchObject({ table: "routine_config", recordId: null, actor: "ana@example.test", context: { routine: SCHEDULED } });
  });

  it("refuses an empty reason, a routine with no switch, and an unknown routine", async () => {
    expect((await turnRoutineOff({ routineId: SCHEDULED, reason: "  " })).ok).toBe(false);
    expect((await turnRoutineOff({ routineId: "mac-mini:htt-nightly-sync", reason: "why" })).ok).toBe(false);
    expect((await turnRoutineOff({ routineId: "/background/meeting-summary/", reason: "why" })).ok).toBe(false);
    expect((await turnRoutineOn({ routineId: "/api/cron/nothing/" })).ok).toBe(false);
    expect(kernel.pause).not.toHaveBeenCalled();
    expect(kernel.resume).not.toHaveBeenCalled();
  });

  it("lets the writer agent be turned off, since the agent driver honours it", async () => {
    expect(await turnRoutineOff({ routineId: "/api/cron/writer-agent/", reason: "why" })).toEqual({ ok: true });
  });

  it("turns a routine on and audits it", async () => {
    expect(await turnRoutineOn({ routineId: SCHEDULED })).toEqual({ ok: true });
    expect(kernel.resume).toHaveBeenCalledWith(SCHEDULED, "person-1");
    expect(kernel.audits[0]).toMatchObject({ newData: { mode: "live", paused_reason: null } });
  });

  it("puts a routine that declares shadow into shadow and audits it (Z.17)", async () => {
    expect(await turnRoutineShadow({ routineId: SHADOW_CAPABLE })).toEqual({ ok: true });
    expect(kernel.shadow).toHaveBeenCalledWith(SHADOW_CAPABLE, "person-1");
    expect(kernel.audits[0]).toMatchObject({ table: "routine_config", newData: { mode: "shadow", paused_reason: null }, context: { routine: SHADOW_CAPABLE } });
  });

  it("refuses shadow for a routine that does not declare it, since it would send for real", async () => {
    for (const id of [SCHEDULED, "/api/cron/writer-agent/", "mac-mini:htt-nightly-sync", "/api/cron/nothing/"]) {
      expect(await turnRoutineShadow({ routineId: id })).toMatchObject({ ok: false });
    }
    expect(kernel.shadow).not.toHaveBeenCalled();
    expect(kernel.audits).toHaveLength(0);
  });
});

describe("Run now", () => {
  it("runs a scheduled routine by hand, audited before the run, and says what it did", async () => {
    expect(await runRoutineNow({ routineId: SCHEDULED })).toEqual({ ok: true, message: "Ran: posted 3" });
    expect(kernel.run).toHaveBeenCalledWith(SCHEDULED, "ana@example.test");
    expect(kernel.audits[0]).toMatchObject({ table: "routine_runs", context: { trigger: "run-now", routine: SCHEDULED } });
  });

  it.each(["running", "waiting"])("refuses while the routine's latest run is %s, and starts nothing", async (status) => {
    latest.value = new Map([[SCHEDULED, [{ status }]]]);
    const res = await runRoutineNow({ routineId: SCHEDULED });
    expect(res).toEqual({ ok: false, error: `It is ${status} already. Run now starts another only once that run has ended.` });
    expect(kernel.run).not.toHaveBeenCalled();
    expect(kernel.audits).toHaveLength(0);
  });

  it("refuses when the latest run cannot be read, rather than starting blind", async () => {
    latest.value = new Error("routine_runs: timeout");
    expect((await runRoutineNow({ routineId: SCHEDULED })).ok).toBe(false);
    expect(kernel.run).not.toHaveBeenCalled();
  });

  it("runs once the latest run has ended", async () => {
    latest.value = new Map([[SCHEDULED, [{ status: "died" }]]]);
    expect((await runRoutineNow({ routineId: SCHEDULED })).ok).toBe(true);
    expect(kernel.run).toHaveBeenCalledOnce();
  });

  it("reports a failed run as an error", async () => {
    kernel.run.mockResolvedValueOnce({ ok: true, status: "error", summary: "Lark refused" });
    expect(await runRoutineNow({ routineId: SCHEDULED })).toEqual({ ok: false, error: "The run failed: Lark refused" });
  });

  it("offers no run of a Mac mini job or an on-demand routine", async () => {
    for (const routineId of ["mac-mini:htt-nightly-sync", "/api/cron/writer-agent/", "/api/cron/htt-rescan-hours/"]) {
      expect((await runRoutineNow({ routineId })).ok).toBe(false);
    }
    expect(kernel.run).not.toHaveBeenCalled();
  });
});

describe("settling a send", () => {
  it("records the answer and audits it with the key", async () => {
    expect(await settleSend({ effectId: EFFECT, outcome: "released" })).toEqual({ ok: true });
    expect(kernel.settle).toHaveBeenCalledWith(EFFECT, "released");
    expect(kernel.audits[0]).toMatchObject({ table: "automation_effects", recordId: EFFECT, newData: { status: "released" }, context: { key: "ideas:nudge:p1:2026-W41" } });
  });

  it("refuses an id that is not a uuid and an answer that is not one of the two", async () => {
    expect((await settleSend({ effectId: "not-an-id", outcome: "done" })).ok).toBe(false);
    expect((await settleSend({ effectId: EFFECT, outcome: "claimed" as "done" })).ok).toBe(false);
    expect(kernel.settle).not.toHaveBeenCalled();
  });
});
