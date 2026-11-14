import { randomUUID } from "node:crypto";
import { resetApprovalsFake } from "@/kernel/approvals/testing/fake";
import { table } from "./proposal-fakes";

// The kernel pieces the proposal chain asks, faked with their rules (Z.10):
// the effect ledger (a key is claimed once; a shadow run records and never
// acts), and the run recorder (a tick runs once per mode; the run's mode is
// what the switch says). The approvals primitive is the kernel's own fake
// (kernel/approvals/testing/fake.ts, A.39), reset with the rest here. Each
// suite wires them in with vi.mock, as the writer's suites do.

export const kernel = {
  parks: [] as { routineId: string; tick: string; status: string; summary: string }[],
  effects: new Map<string, { kind: string; status: string; routineId: string; ref: string | null; summary: string | null }>(),
  dms: [] as { email: string; text: string }[],
  ops: [] as string[],
  holders: [] as string[],
  /** The routine switch: undefined is no row. */
  switchMode: undefined as "live" | "shadow" | "paused" | undefined,
  /** The mode of the run on the current chain, as recordRoutineRun sets it. */
  runMode: "live" as "live" | "shadow",
  ticks: [] as { routineId: string; tick: string; mode: string; status: string }[],
};

export function resetKernel(): void {
  resetApprovalsFake();
  kernel.parks = [];
  kernel.effects = new Map();
  kernel.dms = [];
  kernel.ops = [];
  kernel.holders = [];
  kernel.switchMode = undefined;
  kernel.runMode = "live";
  kernel.ticks = [];
}

export const parksFake = {
  parkRun: async (routineId: string, tick: string, summary: string) => {
    kernel.parks.push({ routineId, tick, status: "waiting", summary });
    return { ok: true };
  },
  closeParkedRun: async (routineId: string, tick: string, outcome: { status: string; summary: string }) => {
    const p = kernel.parks.find((x) => x.routineId === routineId && x.tick === tick && x.status === "waiting");
    if (p) Object.assign(p, outcome);
    return { ok: true };
  },
};

export const effectsFake = {
  once: async (key: string, kind: string, act: () => Promise<{ ok: true; ref?: string | null } | { ok: false; error: string }>, describe: { summary?: string } = {}) => {
    if (kernel.runMode === "shadow") {
      if (!kernel.effects.has(`shadow:${key}`)) kernel.effects.set(`shadow:${key}`, { kind, status: "shadow", routineId: "fake", ref: null, summary: describe.summary ?? null });
      return { acted: false, shadow: true, reason: "shadow" };
    }
    const held = kernel.effects.get(key);
    if (held && held.status !== "released") return { acted: false, reason: `${key} is already claimed or done` };
    kernel.effects.set(key, { kind, status: "claimed", routineId: "/api/cron/proposal-chain/", ref: null, summary: null });
    let outcome: { ok: true; ref?: string | null } | { ok: false; error: string };
    try {
      outcome = await act();
    } catch (err) {
      outcome = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    kernel.effects.set(key, { kind, status: outcome.ok ? "done" : "released", routineId: "/api/cron/proposal-chain/", ref: outcome.ok ? (outcome.ref ?? null) : null, summary: null });
    // The real ledger is a table the chain also reads when a key is taken.
    const rows = table("automation_effects");
    const row = rows.find((r) => r.key === key);
    const fields = { key, routine_id: "/api/cron/proposal-chain/", status: outcome.ok ? "done" : "released", provider_ref: outcome.ok ? (outcome.ref ?? null) : null };
    if (row) Object.assign(row, fields);
    else rows.push({ id: randomUUID(), ...fields });
    return { acted: true, outcome, attempt: 1 };
  },
};

/** A key another writer (the skill) claimed before the chain got to it, settled as `status`. */
export function claimedBySkill(key: string, ref: string | null, status: "done" | "claimed" | "unknown" = "done"): void {
  kernel.effects.set(key, { kind: "publish", status, routineId: "skill:crm-call-to-proposal", ref, summary: null });
  table("automation_effects").push({ id: randomUUID(), key, routine_id: "skill:crm-call-to-proposal", status, provider_ref: ref });
}

/** The run recorder: a tick runs once per mode, in the mode the switch gives a shadow-capable routine. */
export const routineRunsFake = {
  currentRunMode: () => kernel.runMode,
  decideRunMode: async () => {
    if (kernel.switchMode === "paused") return { skip: "paused" };
    return { run: kernel.switchMode === "shadow" ? "shadow" : "live" };
  },
  recordRoutineRun: async (routineId: string, handler: () => Promise<Response>, _host: string, opts: { tick?: string; decided?: { mode: "live" | "shadow" } } = {}) => {
    const mode = opts.decided?.mode ?? (kernel.switchMode === "shadow" ? "shadow" : "live");
    const tick = opts.tick ?? randomUUID();
    if (kernel.ticks.some((t) => t.routineId === routineId && t.tick === tick && ["running", "ok", "skipped"].includes(t.status))) {
      return Response.json({ status: "skipped", reason: "tick-taken" });
    }
    const entry = { routineId, tick, mode, status: "running" };
    kernel.ticks.push(entry);
    const before = kernel.runMode;
    kernel.runMode = mode;
    let res: Response;
    try {
      res = await handler();
    } catch (err) {
      res = Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    } finally {
      kernel.runMode = before;
    }
    // A step that waits for the switch lets its tick go before it closes
    // skipped (kernel/audit/step-now.ts), so it holds nothing and is not an error.
    const waited = res.ok && ((await res.clone().json()) as { status?: string }).status === "skipped";
    entry.status = waited ? "released" : res.ok ? "ok" : "error";
    if (!res.ok) {
      const body = (await res.clone().json()) as { error?: string };
      table("routine_runs").push({ id: randomUUID(), routine_id: routineId, tick_key: tick, status: "error", started_at: new Date(Date.now() - 3_600_000 * 24).toISOString(), error: body.error ?? null, summary: null });
    }
    return res;
  },
};
