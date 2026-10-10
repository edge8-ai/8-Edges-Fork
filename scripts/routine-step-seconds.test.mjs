// Every cron's run deadline matches its route's maxDuration (Y.13). A run's
// step deadline is its claim time plus stepSeconds, and the reaper marks a run
// died once that passes. Left at the kernel's 300 s default, a 60 s route that
// Vercel killed stayed `running` for four more minutes; set above its route's
// maxDuration it could never be reaped in time, and set below it the reaper
// could mark a live run died. The mount (entities/<e>/mounts.ts) is where
// Next reads maxDuration, so the cron's withRoutineRun call must agree with it.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_SECONDS = 300;

function cronMounts() {
  const out = [];
  for (const entity of fs.readdirSync(path.join(ROOT, "entities"))) {
    const mounts = path.join(ROOT, "entities", entity, "mounts.ts");
    if (!fs.existsSync(mounts)) continue;
    const text = fs.readFileSync(mounts, "utf8");
    for (const m of text.matchAll(/"(crons\/[^"]+)":\s*\{\s*segment:\s*\{([^}]*)\}/g)) {
      const declared = m[2].match(/maxDuration:\s*(\d+)/);
      out.push({
        file: path.join("entities", entity, `${m[1]}.ts`),
        maxDuration: declared ? Number(declared[1]) : DEFAULT_SECONDS,
      });
    }
  }
  return out;
}

describe("cron step seconds (Y.13)", () => {
  const crons = cronMounts();

  it("finds the cron mounts", () => {
    expect(crons.length).toBeGreaterThan(40);
  });

  it.each(crons.map((c) => [c.file, c.maxDuration]))("%s passes stepSeconds equal to its maxDuration %i", (file, maxDuration) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    const passed = src.match(/stepSeconds:\s*(\d+)/);
    const seconds = passed ? Number(passed[1]) : DEFAULT_SECONDS;
    expect(seconds).toBe(maxDuration);
  });
});
