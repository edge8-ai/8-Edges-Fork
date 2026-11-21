import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isForkTree } from "./fork-tree.mjs";
import { gateArgs, gatePlan, gateScript, gatesOf, isLintable, readExcludes, ROOT, surelyExcluded } from "./run-gates.mjs";

// The fork has no exclude lists (they describe what leaves this repository),
// so nothing there is "excluded" and the cases that read the real lists only
// mean something here.
const inFork = isForkTree(ROOT);

// The selection is pure, so each rule is checked here without running a gate.
// A wrong "skip" is the costly mistake: a gate that could have failed never
// ran. Every skip rule therefore has a case where the same gate must run.

const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
const gates = gatesOf(scripts);
const patterns = readExcludes();
const excluded = (p) => surelyExcluded(p, patterns);
const plan = (changed) => Object.fromEntries(gatePlan(gates, scripts, changed, { excluded }).map((g) => [g.gate, g]));
const SLOW = ["check:fork-safe", "check:lint-warnings", "check:design", "check:utilities-scope"];

describe("gatesOf", () => {
  it("reads the gates from package.json's check:gates, the four slow ones among them", () => {
    expect(gates.length).toBeGreaterThan(30);
    for (const g of SLOW) expect(gates).toContain(g);
  });

  it("keeps each gate's arguments, so the tracing gate still runs only on a built tree", () => {
    expect(gateArgs(scripts)["check:tracing"]).toEqual(["--if-built"]);
    expect(gateArgs(scripts)["check:crons"]).toEqual([]);
  });
});

describe("gatePlan", () => {
  it("runs every gate but the fast lint count for a change to shipped component code", () => {
    const p = plan(["entities/boards/ui/WorkboardCard.tsx"]);
    expect(p["check:fork-safe"].run).toBe(true);
    expect(p["check:design"].run).toBe(true);
    expect(p["check:utilities-scope"].run).toBe(true);
    expect(p["check:lint-warnings"].run).toBe("fast");
    expect(p["check:lint-warnings"].files).toEqual(["entities/boards/ui/WorkboardCard.tsx"]);
  });

  it.skipIf(inFork)("skips the four slow gates for a change to a Claude hook, which none of them reads", () => {
    const p = plan([".claude/hooks/review-guard.mjs", ".claude/hooks/review-guard.test.mjs"]);
    for (const g of SLOW) expect(p[g].run, g).toBe(false);
  });

  it.skipIf(inFork)("runs check:fork-safe when any changed file ships, and when the fork's own machinery changes", () => {
    expect(plan(["docs/engineering/x.md", "scripts/check-crons.mjs"])["check:fork-safe"].run).toBe(true);
    expect(plan([".github/fork-overlay/entities/org/lib/x.ts"])["check:fork-safe"].run).toBe(true);
    expect(plan([".github/fork-sync-exclude.txt"])["check:fork-safe"].run).toBe(true);
    expect(plan(["entities/htt/lib/x.ts"])["check:fork-safe"].run).toBe(false);
  });

  it("runs check:design and check:utilities-scope for a stylesheet or a public asset, and not for a tool", () => {
    for (const f of ["app/admin/admin.css", "public/images/x.png", "kernel/ui/Badge.ts"]) {
      expect(plan([f])["check:design"].run, f).toBe(true);
      expect(plan([f])["check:utilities-scope"].run, f).toBe(true);
    }
    expect(plan(["scripts/check-crons.mjs"])["check:design"].run).toBe(false);
  });

  it("runs a slow gate in full when its own script or baseline changed", () => {
    expect(plan(["scripts/lint-warning-baseline.json"])["check:lint-warnings"].run).toBe(true);
    expect(plan(["scripts/design/inline-layout-baseline.json"])["check:design"].run).toBe(true);
    expect(plan(["scripts/check-utilities-scope.mjs"])["check:utilities-scope"].run).toBe(true);
    expect(plan(["scripts/check-fork-safe.mjs"])["check:fork-safe"].run).toBe(true);
  });

  it("runs every other gate whatever changed", () => {
    const p = plan(["docs/engineering/x.md"]);
    for (const g of gates.filter((x) => !SLOW.includes(x))) expect(p[g].run, g).toBe(true);
  });
});

describe("surelyExcluded", () => {
  it.skipIf(inFork)("excludes only what the fork's lists certainly leave out", () => {
    expect(surelyExcluded("docs/engineering/x.md", patterns)).toBe(true);
    expect(surelyExcluded("entities/htt/lib/x.ts", patterns)).toBe(true);
    expect(surelyExcluded(".github/workflows/ci.yml", patterns)).toBe(true);
    expect(surelyExcluded("scripts/risk-shadow/ci.mjs", patterns)).toBe(true);
    expect(surelyExcluded("entities/boards/lib/x.ts", patterns)).toBe(false);
    expect(surelyExcluded("app/page.tsx", patterns)).toBe(false);
  });

  it("reads a name pattern at any depth, a dir pattern as its contents, and an anchored one from the root", () => {
    expect(surelyExcluded("a/b/.DS_Store", [".DS_Store"])).toBe(true);
    expect(surelyExcluded("x/private/y.md", ["private/"])).toBe(true);
    expect(surelyExcluded("private", ["private/"])).toBe(false);
    expect(surelyExcluded("docs/a.md", ["/docs/"])).toBe(true);
    expect(surelyExcluded("x/docs/a.md", ["/docs/"])).toBe(false);
  });

  it("treats brackets as literal, as the staging script does, and matches wildcards within a segment", () => {
    expect(surelyExcluded("app/companies/[id]/Band.tsx", ["app/companies/[id]/Band.tsx"])).toBe(true);
    expect(surelyExcluded("app/companies/i/Band.tsx", ["app/companies/[id]/Band.tsx"])).toBe(false);
    expect(surelyExcluded("scripts/x.test.mjs", ["scripts/*.test.mjs"])).toBe(true);
    expect(surelyExcluded("scripts/a/x.test.mjs", ["scripts/*.test.mjs"])).toBe(false);
  });
});

describe("gateScript and isLintable", () => {
  it("finds a gate's script through node flags, and none for a tool", () => {
    expect(gateScript("node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-ai-routing.mjs")).toBe("scripts/check-ai-routing.mjs");
    expect(gateScript("node scripts/gen-bus-table.mjs --check")).toBe("scripts/gen-bus-table.mjs");
    expect(gateScript("knip")).toBeNull();
  });

  it("lints only script files under the lint roots, as lint-changed.sh does", () => {
    expect(isLintable("entities/boards/lib/x.ts")).toBe(true);
    expect(isLintable("app/admin/admin.css")).toBe(false);
    expect(isLintable("scripts/check-crons.mjs")).toBe(false);
  });
});
