// Exercises the eval gate (scripts/check-prompt-evals.mjs) against throwaway
// fixture trees, run as the gate runs: the script under plain node, as a child
// process. Each fixture carries the real kernel/ai/prompts.ts, because the gate
// loads prompts through it rather than restating the hash. The "real repo
// passes" check is `npm run check:prompt-evals` itself, run as a gate.
// Every site name and line of prompt text below is invented.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ROOT, MANIFEST_FILE } from "./check-prompt-evals.mjs";

const GATE = path.join(DEFAULT_ROOT, "scripts/check-prompt-evals.mjs");
const MANIFEST = path.join(DEFAULT_ROOT, "scripts/prompt-evals/manifest.mjs");
const tmpDirs = [];

function write(root, files) {
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
}

const SITE_FILE = "entities/fruit/lib/fruit-sort.ts";
const PROMPT_FILE = "entities/fruit/lib/fruit-sort.prompt.ts";

const site = (name = "fruit-sort") => `import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { FRUIT_SORT_PROMPT } from "./fruit-sort.prompt";
export const FRUIT_SORT_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "${name}", dataClass: FRUIT_SORT_CLASS, tier: "fast" });
`;

const promptFile = (system = "You sort invented fruit by colour.", name = "fruit-sort") => `import { definePrompt } from "@/kernel/ai/prompts";

export const FRUIT_SORT_PROMPT = definePrompt("${name}", {
  system: ${JSON.stringify(system)},
  user: "Fruit: {{fruit}}",
});
`;

/** A tree with one site and its prompt, and (by default) a manifest that records it. */
async function fixture(files = {}, { seeded = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-evals-"));
  tmpDirs.push(root);
  write(root, {
    "kernel/ai/prompts.ts": fs.readFileSync(path.join(DEFAULT_ROOT, "kernel/ai/prompts.ts"), "utf8"),
    [SITE_FILE]: site(),
    [PROMPT_FILE]: promptFile(),
    ...files,
  });
  if (seeded) await seedIn(root);
  return root;
}

// seed() runs in a child process too: inside vitest, a dynamic import goes
// through Vite rather than plain node, and the gate's loader is plain node.
async function seedIn(root, { noCasesOk = false } = {}) {
  const res = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", `const { seed } = await import(${JSON.stringify(MANIFEST)}); const r = await seed(${JSON.stringify(root)}, { noCasesOk: ${noCasesOk} }); console.log(JSON.stringify(r.refused));`], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`seed failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim().split("\n").at(-1));
}

function gate(root) {
  const res = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", GATE, "--root", root], { encoding: "utf8" });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

const manifest = (root) => JSON.parse(fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8"));

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("check-prompt-evals", () => {
  it("passes a tree whose every prompt is recorded at its current version", async () => {
    const root = await fixture();
    const res = gate(root);
    expect(res.out).toContain("1 prompt(s), each at a version with a recorded eval");
    expect(res.status).toBe(0);
    const entry = manifest(root).files[PROMPT_FILE]["fruit-sort"];
    expect(entry).toMatchObject({ status: "baseline", result: "baseline, no cases", cases: null });
    expect(entry.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it("goes red on an unevaluated prompt edit, says how to clear it, and goes green once it is recorded", async () => {
    const root = await fixture();
    const before = manifest(root).files[PROMPT_FILE]["fruit-sort"].version;
    // One word of the system prompt changes; nothing else does.
    write(root, { [PROMPT_FILE]: promptFile("You sort invented fruit by size.") });
    const red = gate(root);
    expect(red.status).toBe(1);
    expect(red.out).toContain(`the prompt fruit-sort is at version`);
    expect(red.out).toContain(`last evaluated version ${before}`);
    expect(red.out).toContain("npm run eval:prompt -- --prompt fruit-sort");

    // Seeding never clears an edit: it records only prompts with no record.
    await seedIn(root);
    expect(gate(root).status).toBe(1);

    // Recording the new version (what eval:prompt does after its run) clears it.
    const res = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", `
      const { loadPrompts } = await import(${JSON.stringify(GATE)});
      const { recordEntry, baselineEntry } = await import(${JSON.stringify(MANIFEST)});
      const { prompts } = await loadPrompts(${JSON.stringify(root)});
      recordEntry(${JSON.stringify(root)}, prompts[0].file, prompts[0].name, baselineEntry(prompts[0].version));
    `], { encoding: "utf8" });
    expect(res.stderr).toBe("");
    expect(gate(root).status).toBe(0);
  });

  it("goes red on a whitespace-only edit too", async () => {
    const root = await fixture();
    write(root, { [PROMPT_FILE]: promptFile("You sort invented fruit by colour. ") });
    expect(gate(root).status).toBe(1);
  });

  it("fails a tree with no manifest, and a prompt with no record", async () => {
    const root = await fixture({}, { seeded: false });
    expect(gate(root).out).toContain(`${MANIFEST_FILE} is missing`);
    write(root, { [MANIFEST_FILE]: JSON.stringify({ files: {} }) });
    const res = gate(root);
    expect(res.status).toBe(1);
    expect(res.out).toContain("the prompt fruit-sort (version");
    expect(res.out).toContain("has no eval in");
  });

  it("fails a record whose prompt no longer exists, and a record with a failing status", async () => {
    const root = await fixture();
    const m = manifest(root);
    m.files["entities/gone/lib/old.prompt.ts"] = { "old-site": { version: "000000000000", status: "baseline" } };
    m.files[PROMPT_FILE]["fruit-sort"].status = "fail";
    write(root, { [MANIFEST_FILE]: JSON.stringify(m) });
    const res = gate(root);
    expect(res.out).toContain("records the prompt old-site, which no file declares any more");
    expect(res.out).toContain('status "fail"');
  });

  it("fails a prompt declared outside a .prompt.ts file", async () => {
    const root = await fixture({
      "entities/fruit/lib/stray.ts": `import { definePrompt } from "@/kernel/ai/prompts";\nexport const STRAY = definePrompt("fruit-sort/stray", { system: "Invented." });\n`,
    });
    expect(gate(root).out).toContain("entities/fruit/lib/stray.ts: declares a prompt outside a *.prompt.ts file");
  });

  it("fails a prompt file that imports anything but the prompts module", async () => {
    const root = await fixture({
      [PROMPT_FILE]: `import { definePrompt } from "@/kernel/ai/prompts";\nimport { companyOs } from "@/kernel/data/supabase";\n${promptFile().split("\n").slice(1).join("\n")}`,
    });
    expect(gate(root).out).toContain('a prompt file imports only "@/kernel/ai/prompts"');
  });

  it("fails a site that sends no prompt, and a prompt named after no site", async () => {
    const root = await fixture({
      "entities/fruit/lib/peel.ts": `import { aiSite } from "@/kernel/ai/gateway";\nimport type { AiDataClass } from "@/kernel/ai/routing";\nexport const PEEL_CLASS: AiDataClass = "B";\nconst AI = aiSite({ site: "fruit-peel", dataClass: PEEL_CLASS, tier: "fast" });\n`,
      "entities/fruit/lib/juice.prompt.ts": promptFile("You juice invented fruit.", "fruit-juice").replace("FRUIT_SORT_PROMPT", "FRUIT_JUICE_PROMPT"),
    });
    const res = gate(root);
    expect(res.out).toContain("the site fruit-peel sends no versioned prompt");
    expect(res.out).toContain("the prompt fruit-juice names no declared site");
  });

  it("excuses a declared site nothing calls only while the manifest says so and it stays prompt-less", async () => {
    const root = await fixture({
      "entities/fruit/lib/peel.ts": `import { aiSite } from "@/kernel/ai/gateway";\nimport type { AiDataClass } from "@/kernel/ai/routing";\nexport const PEEL_CLASS: AiDataClass = "B";\nconst AI = aiSite({ site: "fruit-peel", dataClass: PEEL_CLASS, tier: "fast" });\n`,
    });
    const m = manifest(root);
    write(root, { [MANIFEST_FILE]: JSON.stringify({ ...m, sitesWithoutCalls: { "fruit-peel": "No caller yet." } }) });
    expect(gate(root).status).toBe(0);
    write(root, { [MANIFEST_FILE]: JSON.stringify({ ...m, sitesWithoutCalls: { "fruit-sort": "Stale.", "fruit-gone": "Stale." } }) });
    const res = gate(root);
    expect(res.out).toContain("sitesWithoutCalls names fruit-sort, which now has a prompt");
    expect(res.out).toContain("sitesWithoutCalls names fruit-gone, which no file declares any more");
    expect(res.out).toContain("the site fruit-peel sends no versioned prompt");
  });

  it("refuses a baseline on a site with eval cases unless it was recorded with --no-cases-ok", async () => {
    // The fixture's own site-eval export list names the site, as the real one
    // names the eight sites it can export cases for.
    const root = await fixture({ "scripts/site-eval/export-cases.mjs": `export const SITES = ["fruit-sort"];\n` }, { seeded: false });
    // Seeding skips the prompt rather than record a baseline that no eval backs.
    expect(await seedIn(root)).toEqual(["fruit-sort"]);
    expect(gate(root).out).toContain("the prompt fruit-sort (version");
    // With the flag the baseline is recorded, and says so in the diff.
    expect(await seedIn(root, { noCasesOk: true })).toEqual([]);
    expect(manifest(root).files[PROMPT_FILE]["fruit-sort"]).toMatchObject({ status: "baseline", noCasesOk: true });
    expect(gate(root).status).toBe(0);
    // A baseline without the flag, written by hand or by an older runner, is refused.
    const m = manifest(root);
    delete m.files[PROMPT_FILE]["fruit-sort"].noCasesOk;
    write(root, { [MANIFEST_FILE]: JSON.stringify(m) });
    const res = gate(root);
    expect(res.status).toBe(1);
    expect(res.out).toContain("the prompt fruit-sort is recorded as a baseline, but its site has eval cases");
    expect(res.out).toContain("--no-cases-ok");
  });

  it("fails two prompts with one name", async () => {
    const root = await fixture({
      "entities/fruit/lib/again.prompt.ts": promptFile("A second invented prompt.").replace("FRUIT_SORT_PROMPT", "AGAIN_PROMPT"),
    });
    expect(gate(root).out).toContain("the prompt name fruit-sort is already declared in");
  });
});
