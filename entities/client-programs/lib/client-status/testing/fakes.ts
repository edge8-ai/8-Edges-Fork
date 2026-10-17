// In-memory stand-ins for what the weekly client status run touches (Z.12):
// the report table, the routine run claims, the effect ledger and the Ops
// chat. Each keeps the rule the run leans on: a report moves only from the step
// it names (a conditional update), one row per (company, week), the table's two
// checks hold on every write, a tick is claimed once, an effect key once. Each
// suite wires it in with its own vi.mock calls.
//
// Since Z.12.1 the run opens no approval and parks on nothing. The approvals
// primitive and the parked runs are still faked, as recorders: anything that
// opens an approval or parks a run lands in db.approvals or db.parks, so a
// suite can prove both stay empty.
import { routineResult } from "@/kernel/audit/routine-result";
import { DRIVEN_STEPS, SUPERSEDABLE_STEPS, type ClientStatusStep } from "../steps";
import type { ReportPatch, StatusReport } from "../store";

type Report = StatusReport;

export const db = {
  reports: [] as Report[],
  approvals: [] as { subjectType: string; subjectId: string }[],
  parks: [] as { routineId: string; tick: string }[],
  ticks: new Map<string, string>(),
  effects: new Set<string>(),
  ops: [] as string[],
  clients: new Map<string, { company: string; programIds: string[] }>(),
  roadmap: [] as Record<string, unknown>[],
  documents: [] as Record<string, unknown>[],
  seq: 0,
  failActiveClients: null as string | null,
};

export function resetFakes(): void {
  db.reports.length = 0;
  db.approvals.length = 0;
  db.parks.length = 0;
  db.ticks.clear();
  db.effects.clear();
  db.ops.length = 0;
  db.clients.clear();
  db.roadmap.length = 0;
  db.documents.length = 0;
  db.seq = 0;
  db.failActiveClients = null;
}

const DRIVEN: readonly string[] = DRIVEN_STEPS;
const STALE: readonly string[] = SUPERSEDABLE_STEPS;

// The table's checks (20261009190000), as far as Z.12.1 can reach them: the
// step is one the constraint allows (the TypeScript list is a subset of it), a
// stopped row says why, and the week has the shape. released_is_whole holds
// because nothing writes released or released_at any more. A write that breaks
// one fails the test, as Postgres would refuse it.
const TABLE_STEPS = ["gather", "draft", "check", "ask", "ready", "release", "released", "rejected", "superseded", "stopped"];
function holdsChecks(r: Report): void {
  if (!TABLE_STEPS.includes(r.step)) throw new Error(`check violated: step ${r.step}`);
  if (r.step === "stopped" && !(r.error ?? "").trim()) throw new Error("check violated: stopped_says_why");
  if (!/^\d{4}-W\d{2}$/.test(r.week)) throw new Error(`check violated: week ${r.week}`);
}

const copy = (r: Report): Report => ({ ...r });

export const storeFake = {
  openReports: async (companyIds: string[], week: string) => {
    let opened = 0;
    for (const companyId of companyIds) {
      if (db.reports.some((r) => r.companyId === companyId && r.week === week)) continue;
      db.seq += 1;
      const r: Report = {
        id: `00000000-0000-4000-8000-${String(db.seq).padStart(12, "0")}`,
        companyId,
        week,
        step: "gather",
        startedAt: `2026-10-09T03:00:0${db.seq % 10}.000Z`,
        facts: null,
        aiDraft: null,
        bodyHtml: null,
        version: null,
        editedBy: null,
        editedAt: null,
        error: null,
        createdAt: new Date().toISOString(),
      };
      holdsChecks(r);
      db.reports.push(r);
      opened += 1;
    }
    return { ok: true as const, opened };
  },
  loadReport: async (id: string) => {
    const r = db.reports.find((x) => x.id === id);
    return r ? copy(r) : null;
  },
  reportsOfWeek: async (week: string) => db.reports.filter((r) => r.week === week).map(copy),
  drivenReports: async () => db.reports.filter((r) => DRIVEN.includes(r.step)).map(copy),
  supersedableBefore: async (week: string) => db.reports.filter((r) => r.week < week && STALE.includes(r.step)).map(copy),
  reportsOfCompany: async (companyId: string, limit: number) =>
    db.reports.filter((r) => r.companyId === companyId).sort((a, b) => (a.week < b.week ? 1 : -1)).slice(0, limit).map(copy),
  moveReport: async (id: string, from: readonly ClientStatusStep[], patch: ReportPatch, version?: string) => {
    const r = db.reports.find((x) => x.id === id);
    if (!r || !from.includes(r.step) || (version !== undefined && r.version !== version)) return { ok: true as const, moved: false };
    const next = { ...r, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Report;
    holdsChecks(next);
    Object.assign(r, next);
    return { ok: true as const, moved: true };
  },
};

// Recorders: the run must call none of these (Z.12.1). Each records the call,
// so a suite that mocks them proves the run never asked anyone anything.
export const requestsFake = {
  openApproval: async (ref: { subjectType: string; subjectId: string }) => {
    db.approvals.push({ subjectType: ref.subjectType, subjectId: ref.subjectId });
    return { ok: true as const };
  },
};

export const parksFake = {
  parkRun: async (routineId: string, tick: string) => {
    db.parks.push({ routineId, tick });
    return { ok: true as const };
  },
};

export const effectsFake = {
  once: async (key: string, _kind: string, act: () => Promise<{ ok: boolean }>) => {
    if (db.effects.has(key)) return { acted: false, reason: `${key} is already claimed or done` };
    db.effects.add(key);
    return { acted: true, outcome: await act(), attempt: 1 };
  },
};

export const larkFake = {
  notifyOps: async (message: string) => {
    db.ops.push(message);
    return true;
  },
};

export const activeClientsFake = {
  activeClientCompanies: async () => (db.failActiveClients ? { ok: false as const, error: db.failActiveClients } : { ok: true as const, clients: new Map(db.clients) }),
};

// A PostgREST builder over a fixed list: every filter is a no-op, awaiting it answers the rows.
function rows(list: () => Record<string, unknown>[]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["eq", "is", "in", "gte", "lt", "order", "limit"]) builder[m] = () => builder;
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: list(), error: null });
  return builder;
}

export const readsFake = {
  selectClientBacklogItems: () => rows(() => db.roadmap),
  selectProgramDocuments: () => rows(() => db.documents),
};

// The kernel's client: the run reaches every table through the faked store
// and reads, so any direct query is one this suite did not expect.
export const supabaseFake = {
  companyOs: {
    from: (table: string) => {
      throw new Error(`unscripted table ${table}`);
    },
  },
};

// The run recorder: a tick is claimed once; a claimed tick answers tick-taken
// without running the handler, as claim_tick does. A run that answers non-2xx
// records as an error, which frees the tick for a retry.
export const routineRunsFake = {
  recordRoutineRun: async (routineId: string, handler: () => Promise<Response>, _host?: string, opts: { tick?: string } = {}) => {
    const key = `${routineId} ${opts.tick ?? Math.random()}`;
    const held = db.ticks.get(key);
    if (held === "running" || held === "ok") return Response.json({ status: "skipped", reason: "tick-taken" });
    db.ticks.set(key, "running");
    const res = await handler();
    db.ticks.set(key, res.ok ? "ok" : "error");
    return res;
  },
  withRoutineRun: async (_routineId: string, _req: Request, handler: () => Promise<Response>) => handler(),
  routineResult,
  pausedReason: async () => null,
  // The weekly client status does not run in shadow (spec §10): every run is live.
  decideRunMode: async () => ({ run: "live" as const }),
};
