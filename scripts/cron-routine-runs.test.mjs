// Every cron entry point — GET and any POST alias for a manual trigger — must be
// wrapped in withRoutineRun, or its run leaves no routine_runs row and the AI
// tokens it spends are dropped instead of attributed (Settings -> Agents). The
// second bug-hunt of 2026-09-05 found htt/crons/refresh-summaries.ts exporting a
// bare POST beside a wrapped GET; this holds the rule for every cron file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function cronFiles() {
  const out = [];
  for (const entity of fs.readdirSync(path.join(ROOT, "entities"))) {
    const dir = path.join(ROOT, "entities", entity, "crons");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.push(path.join("entities", entity, "crons", f));
  }
  return out.sort();
}

describe("cron entry points", () => {
  it("exist", () => {
    expect(cronFiles().length).toBeGreaterThan(10);
  });

  it("are all wrapped in withRoutineRun, POST aliases included", () => {
    const bare = [];
    for (const rel of cronFiles()) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const m of src.matchAll(/^export (?:const|async function|function) (GET|POST)\b([^\n]*)/gm)) {
        if (!/withRoutineRun\(/.test(m[2])) bare.push(`${rel}: export ${m[1]}`);
      }
    }
    expect(bare).toEqual([]);
  });

  // withRoutineRun checks the Vercel Cron bearer itself and returns 401 without
  // recording a run. A handler that keeps its own copy of that check is dead
  // code at best and a second, divergent gate at worst.
  it("leave the bearer check to withRoutineRun", () => {
    const withOwnCheck = cronFiles().filter((rel) =>
      /CRON_SECRET/.test(fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^\s*(\/\/|\*|\/\*).*$/gm, "")),
    );
    expect(withOwnCheck).toEqual([]);
  });
});
