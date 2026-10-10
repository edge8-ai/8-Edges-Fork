// Record one run of a Mac mini launchd job in company_os.routine_runs, the
// same table the Vercel crons write through kernel/audit/routine-runs.ts, so
// the Settings -> Agents page shows both hosts side by side. Dependency-free:
// PostgREST over fetch with the service key from .env.local.
//
//   node scripts/routine-run-record.mjs --routine mac-mini:htt-nightly-sync \
//     --status ok --started 2026-09-05T03:30:00Z --log /path/to/run.log [--summary "..."]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");

const started = new Date(opt("--started") ?? Date.now());
const finished = new Date();
const log = opt("--log") ? readFileSync(opt("--log"), "utf8").slice(-20000) : null;
const row = {
  routine_id: opt("--routine"),
  host: "mac-mini",
  status: opt("--status") ?? "ok",
  started_at: started.toISOString(),
  finished_at: finished.toISOString(),
  duration_ms: finished.getTime() - started.getTime(),
  summary: opt("--summary") ?? null,
  log,
};
const res = await fetch(`${url}/rest/v1/routine_runs`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Content-Profile": "company_os", Prefer: "return=minimal" },
  body: JSON.stringify(row),
});
if (!res.ok) throw new Error(`routine_runs insert failed: ${res.status} ${await res.text()}`);
console.log(`recorded ${row.routine_id} ${row.status}`);
