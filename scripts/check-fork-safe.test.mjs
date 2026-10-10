import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { strandedOverlayStubs } from "./check-fork-safe.mjs";

// A fork overlay stub keeps an internal value out of the public fork only while
// it sits on the same path as the real file (W.163, B14). These cases build a
// throwaway tree, because the failure is a file that moved without its stub,
// and the real tree must never be in that state.

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPTS, "..");

let root;

function write(rel, content = "export {};\n") {
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "fork-overlay-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("strandedOverlayStubs", () => {
  it("passes a stub that still sits on its upstream file", () => {
    write("entities/company-os/lib/vercel-analytics-project.ts");
    write(".github/fork-overlay/entities/company-os/lib/vercel-analytics-project.ts");
    expect(strandedOverlayStubs(root)).toEqual([]);
  });

  it("names a stub whose upstream file moved away", () => {
    write("entities/company-os/lib/analytics/vercel-project.ts");
    write(".github/fork-overlay/entities/company-os/lib/vercel-analytics-project.ts");
    write(".github/fork-overlay/kernel/config/gone.ts");
    write(".github/fork-overlay/app/gone/page.tsx");
    expect(strandedOverlayStubs(root)).toEqual([
      "app/gone/page.tsx",
      "entities/company-os/lib/vercel-analytics-project.ts",
      "kernel/config/gone.ts",
    ]);
  });

  it("lets the fork-only files outside the code roots have no upstream", () => {
    write(".github/fork-overlay/README.md", "# runbook\n");
    write(".github/fork-overlay/supabase/01-schema.sql", "select 1;\n");
    write(".github/fork-overlay/supabase/config.toml", "\n");
    expect(strandedOverlayStubs(root)).toEqual([]);
  });

  it("finds no stranded stub in the real tree", () => {
    expect(strandedOverlayStubs(ROOT)).toEqual([]);
  });

  it("fails the gate with a message that names the stub, before staging anything", () => {
    // The script resolves its root from its own location, so a copy under a
    // throwaway scripts/ directory checks the throwaway tree. No staging
    // script exists there, so reaching the stage step would fail differently.
    write(".github/fork-overlay/entities/company-os/lib/vercel-analytics-project.ts");
    mkdirSync(join(root, "scripts"));
    copyFileSync(join(SCRIPTS, "check-fork-safe.mjs"), join(root, "scripts", "check-fork-safe.mjs"));
    const result = spawnSync("node", [join(root, "scripts", "check-fork-safe.mjs")], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fork overlay stubs replace a file the tree no longer has/);
    expect(result.stderr).toContain(".github/fork-overlay/entities/company-os/lib/vercel-analytics-project.ts");
    expect(result.stderr).not.toMatch(/could not stage/);
  });
});
