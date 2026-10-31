import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { replayAll } from "@/entities/ladders/lib/replay";

/**
 * The Vercel cron schedule this routine runs on: once a night, 02:00 in
 * Saigon (19:00 UTC). Declared here, beside the routine, and written into
 * vercel.json by scripts/gen-deployment.mjs for the entities a deployment
 * installs. Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 19 * * *";

/**
 * What Settings -> Agents says about this routine. Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Ladders replay",
  description: "Nightly. Recomputes every person's two ladder positions from their own acts (Turn-ins, sparks, Raids hosted, Beacons lit, leaf cards shipped) and records any tier newly reached and any badge newly found, repairing anything an event missed. Reads each act through its owner's door; never lowers a tier; reports counts only, never a person.",
  content: ["Ladders"],
  apps: ["Supabase"],
};

// Vercel cron (see vercel.json): the nightly replay (LD.1; spec "How positions
// are written"; ADR 0021). Idempotent: run twice, it writes the same rows. The
// first run ever is the launch backfill, which credits history quietly, and
// the first run that finds any badge is the badges' launch, quiet the same way
// (LD.7); the replay decides both itself (lib/replay.ts). The result carries counts of
// people and unlocks and names nobody: a routine run row is read in Settings,
// and a per-person figure there would be the read the fence forbids.
async function handler() {
  const { source, badgeSource, people, unlocked, badges } = await replayAll();
  return routineResult({ status: "ok", source, badgeSource, people, unlocked, badges });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/ladders-replay/", req, handler, "vercel", { stepSeconds: 300 });
