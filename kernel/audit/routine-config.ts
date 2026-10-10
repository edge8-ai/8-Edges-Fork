import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import automations from "./automations.json";

// The routine switch (Y.7): company_os.routine_config, one row per routine
// that someone has switched. `mode = 'paused'` with a reason makes every
// scheduled tick record a skipped run saying `paused: <reason>`
// (routine-runs.ts, decideRunMode), and the agent driver leaves a paused
// agent's runs waiting (step-driver.ts). `mode = 'shadow'` (Z.17) runs the
// work but sends, publishes and writes nothing outward: the effect ledger
// records what each effect would have been instead (effects.ts, once). Only a
// routine that declares `shadow: true` in its automation block honours it. A
// routine with no row is live.
//
// Settings -> Agents (Y.25) reads and writes it here, because the kernel owns
// the table. Turning a routine on writes `mode = 'live'` rather than deleting
// the row, so the row keeps who switched it last and when.

/** The switch's three positions (Z.17); a routine with no row is live. */
export type RoutineMode = "live" | "shadow" | "paused";
const MODES: readonly string[] = ["live", "shadow", "paused"];
const isMode = (v: string): v is RoutineMode => MODES.includes(v);

export type RoutineSwitch = {
  routineId: string;
  mode: RoutineMode;
  paused: boolean;
  reason: string | null;
  updatedAt: string;
  /** Who switched it last, by the name they go by; null when unknown. */
  updatedBy: string | null;
};

type Row = {
  routine_id: string;
  mode: string;
  paused_reason: string | null;
  updated_at: string;
  person: NamedPerson | NamedPerson[] | null;
};

/**
 * Every switched routine. A failed read throws: a page that showed every
 * switch as on because the read failed would tell a person that a paused
 * routine is running.
 */
export async function routineSwitches(): Promise<Map<string, RoutineSwitch>> {
  const rows = mustRows(
    await companyOs
      .from("routine_config")
      .select(`routine_id, mode, paused_reason, updated_at, person:people!updated_by(${NAME_COLUMNS})`),
    "routine_config",
  ) as unknown as Row[];
  const out = new Map<string, RoutineSwitch>();
  for (const r of rows) {
    const person = Array.isArray(r.person) ? r.person[0] : r.person;
    // The check constraint admits only the three positions. Anything else is
    // shown as paused, the position that does nothing, rather than as live.
    const mode = isMode(r.mode) ? r.mode : "paused";
    out.set(r.routine_id, {
      routineId: r.routine_id,
      mode,
      paused: mode === "paused",
      reason: r.paused_reason,
      updatedAt: r.updated_at,
      updatedBy: person ? personName(person, null) : null,
    });
  }
  return out;
}

/** Longest reason kept; every skipped run repeats it in its summary. */
export const PAUSE_REASON_MAX = 200;

/** Switch a routine off. The reason is required: every skipped run will say it. */
export async function pauseRoutine(routineId: string, reason: string, personId: string | null): Promise<Result> {
  const why = reason.trim().slice(0, PAUSE_REASON_MAX);
  if (!why) return { ok: false, error: "Say why it is off: every skipped run repeats the reason." };
  return write(routineId, { mode: "paused", paused_reason: why }, personId);
}

/** Switch a routine back on. */
export async function resumeRoutine(routineId: string, personId: string | null): Promise<Result> {
  return write(routineId, { mode: "live", paused_reason: null }, personId);
}

/**
 * Put a routine into shadow: it runs, records what it would have done, and
 * does nothing outward. No reason is asked, because shadow stops nothing a
 * person relies on. The caller checks that the routine declares shadow.
 */
export async function shadowRoutine(routineId: string, personId: string | null): Promise<Result> {
  return write(routineId, { mode: "shadow", paused_reason: null }, personId);
}

// The cron paths whose automation block declares `shadow: true`, generated
// into automations.json by scripts/gen-deployment.mjs.
const SHADOW_ROUTINES = new Set(
  (automations as { path: string; shadow?: boolean }[]).filter((a) => a.shadow === true).map((a) => a.path),
);

/** Whether a cron routine declares that it honours shadow mode (Z.17). */
export function declaresShadow(routineId: string): boolean {
  return SHADOW_ROUTINES.has(routineId);
}

export type ModeRead = { ok: true; mode: RoutineMode; reason: string | null } | { ok: false; error: string };

/**
 * One routine's switch, as a run reads it before it claims its tick. A routine
 * with no row is live. A failed read, or a value the check constraint should
 * never have let in, comes back as an error for the caller to decide on
 * (routine-runs.ts, decideRunMode); it is never guessed here.
 */
export async function readRoutineMode(routineId: string): Promise<ModeRead> {
  try {
    const { data, error } = await companyOs.from("routine_config").select("mode, paused_reason").eq("routine_id", routineId).maybeSingle();
    if (error) return { ok: false, error: `routine_config ${routineId}: ${error.message}` };
    if (!data) return { ok: true, mode: "live", reason: null };
    if (!isMode(data.mode)) return { ok: false, error: `routine_config ${routineId}: unknown mode ${data.mode}` };
    return { ok: true, mode: data.mode, reason: data.paused_reason };
  } catch (err) {
    // A throw (a network failure, or a test double with no reader) is a failed read.
    return { ok: false, error: `routine_config ${routineId}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function write(
  routineId: string,
  patch: { mode: RoutineMode; paused_reason: string | null },
  personId: string | null,
): Promise<Result> {
  const { data, error } = await companyOs
    .from("routine_config")
    .upsert({ routine_id: routineId, ...patch, updated_by: personId, updated_at: new Date().toISOString() }, { onConflict: "routine_id" })
    .select("routine_id");
  if (error) return { ok: false, error: `routine_config: ${error.message}` };
  if (!data || data.length !== 1) return { ok: false, error: `routine_config: expected one row, wrote ${data?.length ?? 0}` };
  return { ok: true };
}
