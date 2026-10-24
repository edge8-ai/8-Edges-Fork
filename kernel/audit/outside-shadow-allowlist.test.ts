import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Z.17: outsideShadow lets a send out of a shadow run, so every call of it is
// an exception someone reviewed. This pins the list. A new call fails here
// until it is reviewed and added below with its reason; one removed fails too,
// so the list never names a call that is gone.

const REVIEWED: Record<string, { calls: number; reason: string }> = {
  "kernel/audit/routine-runs.ts": {
    calls: 1,
    reason: "the alert to Operations that the routine has failed twice in a row, which matters in any mode",
  },
};

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCANNED = ["app", "entities", "kernel", "scripts"];
const DEFINED_IN = "kernel/audit/run-context.ts";

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !/\.test\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("outsideShadow call sites (Z.17)", () => {
  it("are exactly the reviewed list", () => {
    // A file that imports it (under any local name) or calls it, with its call count.
    const found: Record<string, number> = {};
    for (const top of SCANNED) {
      for (const file of sources(path.join(ROOT, top))) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (rel === DEFINED_IN) continue;
        const text = fs.readFileSync(file, "utf8");
        const imports = /import\s*(type\s*)?\{[^}]*\boutsideShadow\b[^}]*\}\s*from/.test(text);
        const calls = (text.match(/\boutsideShadow\s*\(/g) ?? []).length;
        if (imports || calls > 0) found[rel] = calls;
      }
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(REVIEWED).map(([f, r]) => [f, r.calls])));
  });
});
