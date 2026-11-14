#!/usr/bin/env node
// `npm run audit:leave-approvals` (A.30): lists leave whose latest approval
// contradicts its status, and exits 1 when there is any.
//
// time_off.status is the truth about the leave; the approval is the history of
// who was asked and who answered, and a subject's answer is its latest row. The
// two are written one after the other by entities/time-off/lib/leave-transition.ts,
// and an approval write that fails never undoes the leave, so this is how a lost
// write, or a hand-run SQL edit to either table, is found rather than assumed
// away. Leave with no approval row at all (history from before approvals
// existed) is not a contradiction. The first row this ever returns is the
// premise for making the two writes one database function.
//
// The query lives here rather than in a .sql file because the public fork
// receives scripts/ and its SQL is exactly its three setup files.
//
// Outside `npm run check`, like audit:parity, because it reads the database and
// a laptop without a linked project cannot run it. It goes through the Supabase
// CLI rather than a service key, so it needs `supabase login` and nothing from
// .env.local. The project is the linked one (supabase/.temp/project-ref after
// `supabase link`), or SUPABASE_PROJECT_ID; this file names nobody's, so a fork
// audits its own.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUERY = `
with latest as (
  select distinct on (subject_id) subject_id, state, created_at
  from company_os.approvals
  where subject_type = 'time_off'
  order by subject_id, created_at desc, id desc
)
select t.id as request_id,
       t.status as leave_status,
       l.state as latest_approval,
       l.created_at as approval_written_at
from company_os.time_off t
join latest l on l.subject_id = t.id::text
where l.state is distinct from case t.status
        when 'requested' then 'pending'
        when 'approved' then 'approved'
        when 'taken' then 'approved'
        when 'rejected' then 'rejected'
        when 'cancelled' then 'cancelled'
      end
order by l.created_at desc;
`;

function projectId() {
  if (process.env.SUPABASE_PROJECT_ID) return process.env.SUPABASE_PROJECT_ID;
  try {
    return readFileSync(join(ROOT, "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

/**
 * The rows out of `supabase db query` output, which is JSON with a trailing
 * warning and a banner or two around it; null when there is no rows array,
 * which is a failed query, never "no contradictions".
 */
export function parseRows(output) {
  const m = /"rows":\s*(\[[\s\S]*?\])\s*,\s*"warning"/.exec(output) ?? /"rows":\s*(\[[\s\S]*?\])\s*\}/.exec(output);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** The line for one contradiction. */
export function describe(row) {
  return `${row.request_id}: leave is ${row.leave_status}, its latest approval is ${row.latest_approval} (written ${row.approval_written_at})`;
}

function main() {
  const ref = projectId();
  const args = ["db", "query", "--linked", ...(ref ? ["--project-ref", ref] : []), QUERY];
  const run = spawnSync("supabase", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const rows = parseRows(run.stdout ?? "");
  if (run.status !== 0 || rows === null) {
    console.error("audit:leave-approvals: the query did not run, so nothing is known.");
    console.error((run.stderr || run.stdout || "").trim());
    process.exit(2);
  }
  if (rows.length === 0) {
    console.log("audit:leave-approvals: every leave agrees with its latest approval.");
    return;
  }
  console.error(`audit:leave-approvals: ${rows.length} leave disagree with their latest approval:`);
  for (const row of rows) console.error(`  ${describe(row)}`);
  console.error("The first one is the premise for making the leave write and its approval one database function (A.30).");
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
