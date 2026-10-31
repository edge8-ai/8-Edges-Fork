// Loads every past payroll month from the accountant's workbooks, through the
// same reader, matcher and save the Finance → Payroll upload uses
// (entities/finance/lib/payroll/), matched against the same people
// (payroll-people.ts beside the upload action), so a month loaded here is
// exactly what an upload of that file would save, audit row included. It
// replaces scripts/payroll/import_payroll.py.
//
// It never prints an amount: the report names people and months only, because
// it is read in a terminal and pasted into chats.
//
// A name the rules cannot match is matched by a picks file, a JSON object from
// the name as the workbook spells it to the team member id it paid:
//   { "Ngo Phat Tai": "<team_members.id>" }
// Nothing is written while any line in any month is still unmatched.
//
// Usage (from the repo root, needs the Supabase service key in .env.local):
//   npx --yes tsx --tsconfig tsconfig.json scripts/payroll-backfill.mts [--dir ~/Payroll] [--picks picks.json] [--write]
import { readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim().replace(/^"|"$/g, "");
}

const { recordAudit } = await import("@/kernel/audit/audit");
const { parseWorkbook, norm } = await import("@/entities/finance/lib/payroll/parse");
const { matchRun } = await import("@/entities/finance/lib/payroll/match");
const { savePayrollRun } = await import("@/entities/finance/lib/payroll/store");
const { payrollPeople, vietnamEntityId } = await import("@/entities/finance/routes/team/(dashboard)/finance/payroll/payroll-people");

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dir = (flag("--dir") ?? path.join(os.homedir(), "Payroll")).replace(/^~/, os.homedir());
const write = args.includes("--write");
const picksByName = new Map(Object.entries(flag("--picks") ? (JSON.parse(readFileSync(flag("--picks") as string, "utf8")) as Record<string, string>) : {}).map(([k, v]) => [norm(k), v]));

const [people, legalEntityId] = await Promise.all([payrollPeople(), vietnamEntityId()]);

const files = readdirSync(dir)
  .filter((d) => statSync(path.join(dir, d)).isDirectory())
  .flatMap((d) => readdirSync(path.join(dir, d)).filter((f) => f.endsWith(".xlsx") && !f.startsWith("~$")).map((f) => path.join(dir, d, f)));
const months = files
  .map((f) => {
    const bytes = new Uint8Array(readFileSync(f));
    const run = parseWorkbook(bytes, path.basename(f));
    const picked: Record<number, string> = {};
    for (const l of run.lines) {
      const tm = picksByName.get(norm(l.name));
      if (tm) picked[l.source_row] = tm;
    }
    return { file: f, bytes, run, match: matchRun(run, people, picked) };
  })
  // By month, then by file name with numbers read as numbers, so of two
  // workbooks for one month "…_v2.xlsx" and "…_v10.xlsx" sort after the
  // first, whatever order the directory listing returned them in.
  .sort((a, b) => a.run.period.localeCompare(b.run.period) || path.basename(a.file).localeCompare(path.basename(b.file), "en", { numeric: true }));

// Two workbooks for one month (a "v2"): the later file name wins, as a
// re-upload would, and the report says which file was kept.
const byMonth = new Map(months.map((m) => [m.run.period, m]));
const replaced = months.filter((m) => byMonth.get(m.run.period) !== m);
const problems = new Map<string, string[]>();
for (const m of byMonth.values()) for (const p of m.match.problems) problems.set(`${p.name} (${p.why})`, [...(problems.get(`${p.name} (${p.why})`) ?? []), m.run.period.slice(0, 7)]);

console.log(`${files.length} workbooks, ${byMonth.size} months, ${[...byMonth.values()].reduce((s, m) => s + m.run.lines.length, 0)} register lines.`);
for (const m of replaced) console.log(`  ${m.run.period.slice(0, 7)}: ${path.basename(m.file)} skipped for ${path.basename(byMonth.get(m.run.period)!.file)}`);
if (problems.size) {
  console.log(`\nNOT MATCHED (${problems.size}):`);
  for (const [who, ms] of problems) console.log(`  ${who}: ${ms[0]} to ${ms[ms.length - 1]} (${ms.length} months)`);
}
if (!write) {
  console.log("\nDry run: nothing written. Re-run with --write to save every month.");
  process.exit(0);
}
if (problems.size) {
  console.error("\nRefusing to write while any line is unmatched, ambiguous or twice in one month.");
  process.exit(1);
}
for (const m of byMonth.values()) {
  const saved = await savePayrollRun({ run: m.run, lines: m.match.lines, legalEntityId, bytes: m.bytes, importedBy: "payroll-backfill" });
  await recordAudit({
    table: "payroll_runs_sensitive",
    recordId: saved.runId,
    operation: "update",
    actor: "payroll-backfill",
    context: { action: "payroll_backfill", period: m.run.period, lines: saved.lines, source_file: m.run.sourceFile },
  });
  console.log(`  saved ${m.run.period.slice(0, 7)}: ${saved.lines} lines`);
}
console.log("Done.");
