// Proves the committed eslint.config.mjs still enforces each guard it carries
// (B.18.1). The config moved from .eslintrc.json to flat config; a guard that
// silently stopped matching would leave `npm run lint` green and the boundary
// it polices open, so each one is planted here and must fail by rule id.
//
// The source is linted in memory under a virtual path inside the real tree, so
// the config's `files` patterns and the import resolver see what they see in a
// real run, and nothing is written to disk. Imports point at real files, because
// import/no-restricted-paths ignores an import it cannot resolve.
//
// loadESLint exists in ESLint 8.57 and 9, so this test outlives the move to
// ESLint 9 in B.18.3.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FlatESLint = await loadESLint({ useFlatConfig: true });
const eslint = new FlatESLint({
  cwd: REPO_ROOT,
  overrideConfigFile: path.join(REPO_ROOT, "eslint.config.mjs"),
  // import/no-cycle reads the linted module's own exports from disk and throws
  // on a path that is not there. No assertion here is about cycles, so it is
  // the one rule switched off; every guard under test runs as committed.
  overrideConfig: { rules: { "import/no-cycle": "off" } },
});

/** The rule ids `code` produces when it lives at `rel`. */
async function ruleIds(rel, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(REPO_ROOT, rel) });
  return result.messages.map((m) => m.ruleId);
}

// ESLint resolves the config for a path, loads the TypeScript parser and
// builds the import resolver on the FIRST lintText, not in the constructor:
// about 3.8 s on an idle machine, every millisecond of it charged to whichever
// test ran first. Under the full pre-push suite on 2026-10-07 that first test
// hit its 30 s. Paid here instead, at module load, which is where the cost
// belongs and where no test's clock is running (S.15 made the same move for
// the entity barrels). The probe is a real file path with the parser the
// guards need, so what it warms is what the tests use.
await ruleIds("entities/site/lib/__warm__.ts", "export const warm = 1;\n");

describe("eslint.config.mjs, run through ESLint", () => {
  it("rejects an entity reaching past another entity's doors", async () => {
    const ids = await ruleIds(
      "entities/site/lib/__probe__.ts",
      'import { computeHealthScore } from "@/entities/crm/lib/account-health-score";\nexport const x = computeHealthScore;\n',
    );
    expect(ids).toContain("import/no-restricted-paths");
  });

  it("allows an entity to import another entity's index", async () => {
    const ids = await ruleIds("entities/site/lib/__probe__.ts", 'import * as crm from "@/entities/crm";\nexport const x = crm;\n');
    expect(ids).not.toContain("import/no-restricted-paths");
  });

  it("rejects app/ importing past an entity's doors", async () => {
    const ids = await ruleIds(
      "app/__probe__.ts",
      'import { computeHealthScore } from "@/entities/crm/lib/account-health-score";\nexport const x = computeHealthScore;\n',
    );
    expect(ids).toContain("import/no-restricted-paths");
  });

  it("rejects kernel/ importing an entity", async () => {
    const ids = await ruleIds("kernel/data/__probe__.ts", 'import * as crm from "@/entities/crm";\nexport const x = crm;\n');
    expect(ids).toContain("import/no-restricted-paths");
  });

  it("rejects a private route literal in shipped code, and allows it in the library entity", async () => {
    // Assembled at run time: spelled out here, the routes would make this test
    // file the thing the fork scanner refuses (check:fork-safe).
    const privateFlow = ["", "workflows", "private", "some-flow"].join("/");
    const blueprints = ["", "blueprints", ""].join("/");
    const code = `export const href = "${privateFlow}";\nexport const tpl = \`${blueprints}\${href}\`;\n`;
    const shipped = await ruleIds("entities/crm/lib/__probe__.ts", code);
    expect(shipped.filter((id) => id === "no-restricted-syntax")).toHaveLength(2);
    expect(await ruleIds("entities/library/lib/__probe__.ts", code)).not.toContain("no-restricted-syntax");
  });

  it("rejects new Anthropic() outside the kernel factory, and allows it inside", async () => {
    const code = 'import Anthropic from "@anthropic-ai/sdk";\nexport const client = new Anthropic();\n';
    expect(await ruleIds("entities/crm/lib/__probe__.ts", code)).toContain("no-restricted-syntax");
    expect(await ruleIds("kernel/ai/client.ts", code)).not.toContain("no-restricted-syntax");
  });

  it("still refuses new Anthropic() in a file allowed to name private routes", async () => {
    // The library override drops the private-route selectors only; the
    // single-client rule must survive it.
    const code = 'import Anthropic from "@anthropic-ai/sdk";\nexport const client = new Anthropic();\n';
    expect(await ruleIds("entities/library/lib/__probe__.ts", code)).toContain("no-restricted-syntax");
  });

  it("rejects getSiteOrigin() without await, everywhere, and allows it awaited", async () => {
    // SA.2: the survey reminder cron sent "[object Promise]/team/..." links.
    const head = 'import { getSiteOrigin } from "@/kernel/config/site-origin";\n';
    const bare = `${head}export async function f(p: string) {\n  const o = getSiteOrigin();\n  return \`\${getSiteOrigin()}\${p}\${o}\`;\n}\n`;
    const awaited = `${head}export async function f(p: string) {\n  return \`\${await getSiteOrigin()}\${p}\`;\n}\n`;
    const hits = (ids) => ids.filter((id) => id === "no-restricted-syntax");
    expect(hits(await ruleIds("entities/org/crons/__probe__.ts", bare))).toHaveLength(2);
    // The override that frees tests and the library to name private routes keeps this check.
    expect(hits(await ruleIds("entities/library/lib/__probe__.ts", bare))).toHaveLength(2);
    expect(hits(await ruleIds("entities/org/crons/__probe__.test.ts", bare))).toHaveLength(2);
    expect(await ruleIds("entities/org/crons/__probe__.ts", awaited)).not.toContain("no-restricted-syntax");
  });

  it("lets getSiteOrigin()'s Promise be handed on whole, and still sees it under a namespace or an alias", async () => {
    // SA.3: returning the Promise or awaiting it inside Promise.all is as safe
    // as awaiting it; an alias or a namespace call would hide it from the guard.
    const head = 'import { getSiteOrigin } from "@/kernel/config/site-origin";\n';
    const handedOn =
      `${head}export function a() {\n  return getSiteOrigin();\n}\n` +
      `export const b = async () => getSiteOrigin();\n` +
      `export async function c() {\n  const [o] = await Promise.all([getSiteOrigin(), Promise.resolve(1)]);\n  return o;\n}\n`;
    expect(await ruleIds("entities/org/crons/__probe__.ts", handedOn)).not.toContain("no-restricted-syntax");

    const hits = async (code) =>
      (await ruleIds("entities/org/crons/__probe__.ts", code)).filter((id) => id === "no-restricted-syntax");
    const namespaced =
      'import * as site from "@/kernel/config/site-origin";\n' +
      "export async function f(p: string) {\n  return `${site.getSiteOrigin()}${p}${await site.getSiteOrigin()}`;\n}\n";
    expect(await hits(namespaced)).toHaveLength(1);
    const aliased = 'import { getSiteOrigin as origin } from "@/kernel/config/site-origin";\nexport const o = origin;\n';
    expect(await hits(aliased)).toHaveLength(1);
  });

  it("rejects a hook called conditionally", async () => {
    const code =
      'import { useState } from "react";\nexport function Probe({ on }: { on: boolean }) {\n  if (on) useState(0);\n  return null;\n}\n';
    expect(await ruleIds("entities/crm/ui/__probe__.tsx", code)).toContain("react-hooks/rules-of-hooks");
  });

  it("does not ignore the directories the gate lints", async () => {
    for (const rel of ["app/__probe__.ts", "kernel/__probe__.ts", "entities/crm/__probe__.tsx", "scripts/__probe__.mjs"]) {
      expect(await eslint.isPathIgnored(path.join(REPO_ROOT, rel))).toBe(false);
    }
    expect(await eslint.isPathIgnored(path.join(REPO_ROOT, "video/src/__probe__.ts"))).toBe(true);
  });
});
