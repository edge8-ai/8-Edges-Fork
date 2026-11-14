// Exercises scripts/check-ai-routing.mjs against throwaway fixture trees.
//
// Each fixture carries the real kernel/ai/routing.ts and kernel/ai/models.ts,
// because the check imports them rather than copying the rule; the entity
// files are written per test, and a baseline recording them as they stand, the
// way the repo commits scripts/ai-routing-baseline.json. The "real repo passes"
// check is the `check:ai-routing` script itself, run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BASELINE_FILE, DEFAULT_ROOT, checkAiRouting, writeAiRoutingBaseline } from "./check-ai-routing.mjs";

const tmpDirs = [];

function write(root, files) {
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
}

async function fixture(files, { baseline = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-routing-"));
  tmpDirs.push(root);
  write(root, {
    "kernel/ai/routing.ts": fs.readFileSync(path.join(DEFAULT_ROOT, "kernel/ai/routing.ts"), "utf8"),
    "kernel/ai/models.ts": fs.readFileSync(path.join(DEFAULT_ROOT, "kernel/ai/models.ts"), "utf8"),
    ...files,
  });
  // The baseline records the fixture as it stands, readable sites only, even
  // when a test is about to prove some other rule fails on it.
  if (baseline) {
    const { routes } = await checkAiRouting(root, {});
    write(root, { [BASELINE_FILE]: JSON.stringify({ files: routes }) });
  }
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const declared = (cls, extra = "") => `import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
export const RESUME_SCREEN_CLASS: AiDataClass = "${cls}";
const AI = aiSite({ site: "resume-screen", dataClass: RESUME_SCREEN_CLASS, tier: "standard"${extra} });
`;

describe("check-ai-routing", () => {
  it("passes a site that declares its class and resolves within it", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") });
    const { errors, sites } = await checkAiRouting(root, {});
    expect(errors).toEqual([]);
    expect(sites).toEqual([
      { file: "entities/hiring/lib/resume-screen.ts", site: "resume-screen", dataClass: "S", model: "claude-sonnet-5" },
    ]);
  });

  it("fails a class S site whose model resolves to anything but Claude", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") });
    const { errors } = await checkAiRouting(root, { AI_MODEL_RESUME_SCREEN: "deepseek/deepseek-v4-pro" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("entities/hiring/lib/resume-screen.ts:4");
    expect(errors[0]).toContain("class S");
  });

  it("resolves a step's own override first, then its shared model, and moves only that step (Y.71.1)", async () => {
    const root = await fixture({
      "entities/campaigns/lib/writer/model.ts": `export const WRITER_LETTER_GATHER_CLASS: AiDataClass = "C";
export const WRITER_PUBLISHED_CLASS: AiDataClass = "A";
const G = aiSite({ site: "writer-letter-gather", modelSite: "brand-writer", dataClass: WRITER_LETTER_GATHER_CLASS, tier: "standard" });
const E = aiSite({ site: "writer-edit", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "standard" });
const S = aiSite({ site: "writer-seo", modelSite: "brand-writer", dataClass: WRITER_PUBLISHED_CLASS, tier: "standard" });
`,
    });
    // One step's own override moves that step and leaves its siblings on the shared model.
    const moved = await checkAiRouting(root, { AI_MODEL_WRITER_EDIT: "deepseek/deepseek-v4.1-flash" });
    expect(moved.errors).toEqual([]);
    const model = (site) => moved.sites.find((x) => x.site === site)?.model;
    expect(model("writer-edit")).toBe("deepseek/deepseek-v4.1-flash");
    expect(model("writer-seo")).toBe("claude-sonnet-5");
    // A class C step pointed at Fable fails the gate, by its own name or the shared one.
    for (const env of [{ AI_MODEL_WRITER_LETTER_GATHER: "claude-fable-5-1" }, { WRITER_CLAUDE_MODEL: "claude-fable-5-1" }]) {
      const { errors } = await checkAiRouting(root, env);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("writer-letter-gather");
    }
    // The baseline names the step's own override first.
    expect(moved.routes["entities/campaigns/lib/writer/model.ts"]["writer-edit"].overrides).toEqual([
      "AI_MODEL_WRITER_EDIT",
      "AI_MODEL_BRAND_WRITER",
      "WRITER_CLAUDE_MODEL",
    ]);
  });

  it("lets a class B site run a non-Claude model", async () => {
    const root = await fixture({ "entities/ideas/lib/ai/idea-trends.ts": declared("B") });
    expect((await checkAiRouting(root, { AI_MODEL_RESUME_SCREEN: "qwen/qwen3.8-flash" })).errors).toEqual([]);
  });

  it("fails a class S or C site whose model resolves to Fable, and lets B and A keep it", async () => {
    for (const cls of ["S", "C"]) {
      const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared(cls) });
      const { errors } = await checkAiRouting(root, { AI_MODEL_RESUME_SCREEN: "claude-fable-5-1" });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`class ${cls}`);
      expect(errors[0]).toContain("30 days");
    }
    for (const cls of ["B", "A"]) {
      const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared(cls) });
      expect((await checkAiRouting(root, { AI_MODEL_RESUME_SCREEN: "claude-fable-5-1" })).errors).toEqual([]);
    }
  });

  it("fails a site with no class, a literal class, or a name that is not a class constant", async () => {
    const root = await fixture({
      "entities/a/lib/none.ts": `const AI = aiSite({ site: "a-site", tier: "fast" });\n`,
      "entities/b/lib/literal.ts": `const AI = aiSite({ site: "b-site", dataClass: "S", tier: "fast" });\n`,
      "entities/c/lib/loose.ts": `const C = "S";\nconst AI = aiSite({ site: "c-site", dataClass: C, tier: "fast" });\n`,
    });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/a-site has no dataClass/);
    expect(errors.join("\n")).toMatch(/b-site passes its class as a literal/);
    expect(errors.join("\n")).toMatch(/c-site's dataClass C is not/);
  });

  it("fails a model or a client taken outside the gateway, and ignores comments about them", async () => {
    const root = await fixture({
      "entities/a/lib/direct.ts": `import { modelFor } from "@/kernel/ai/models";\nconst MODEL = modelFor("x", "fast");\n`,
      "entities/b/lib/client.ts": `import { anthropicIfConfigured } from "@/kernel/ai/client";\nconst c = anthropicIfConfigured();\n`,
      "entities/c/lib/prose.ts": `// modelFor("x", "fast") used to live here, next to anthropic().\nexport const x = 1;\n`,
      "kernel/ai/gateway.ts": `import { anthropic } from "@/kernel/ai/client";\nexport function aiSite(decl) { return modelFor(decl.site, decl.tier); }\n`,
    });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toEqual([
      "entities/a/lib/direct.ts: calls modelFor outside the gateway; declare the site with aiSite from @/kernel/ai/gateway.",
      "entities/b/lib/client.ts: builds its own model client; take it from aiSite(...).client() or .clientIfConfigured().",
    ]);
  });

  it("holds a provider's own API to classes B and A", async () => {
    const call = (cls) => `export const BRAND_IMAGE_CLASS: AiDataClass = "${cls}";
await otherProviderCall<GeminiReply>({ site: "brand-image", dataClass: BRAND_IMAGE_CLASS, provider: "google", model: M, input: x }, run);
`;
    expect((await checkAiRouting(await fixture({ "entities/campaigns/lib/ai/brand-image.ts": call("A") }), {})).errors).toEqual([]);
    const { errors } = await checkAiRouting(await fixture({ "entities/campaigns/lib/ai/brand-image.ts": call("S") }), {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("brand-image");
  });

  it("fails a site whose tier changed since the baseline, whatever this machine's env says", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") });
    write(root, { "entities/hiring/lib/resume-screen.ts": declared("S").replace('tier: "standard"', 'tier: "fast"') });
    // An override pinning the old model changes nothing: the baseline records what the code decides.
    const { errors } = await checkAiRouting(root, { AI_MODEL_RESUME_SCREEN: "claude-sonnet-5" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("resume-screen moved");
    expect(errors[0]).toContain("tier standard, modelKey resume-screen, model claude-sonnet-5");
    expect(errors[0]).toContain("tier fast, modelKey resume-screen, model claude-sonnet-5");
  });

  it("fails a renamed site, naming the env overrides the old name loses", async () => {
    const plan = (site) => `export const IDEA_PLAN_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "${site}", dataClass: IDEA_PLAN_CLASS, tier: "standard" });
`;
    const root = await fixture({ "entities/ideas/lib/ai/idea-plan.ts": plan("admin-idea-plan") });
    write(root, { "entities/ideas/lib/ai/idea-plan.ts": plan("idea-plan") });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^entities\/ideas\/lib\/ai\/idea-plan\.ts: admin-idea-plan is in scripts\/ai-routing-baseline\.json but no site declares it/);
    expect(errors[0]).toContain("AI_MODEL_ADMIN_IDEA_PLAN / IDEAS_CLAUDE_MODEL stop applying");
    expect(errors[1]).toMatch(/^entities\/ideas\/lib\/ai\/idea-plan\.ts: idea-plan is declared but not in scripts\/ai-routing-baseline\.json/);
  });

  it("fails a site whose model stops resolving under its modelSite", async () => {
    const step = (extra) => `export const WRITER_PLAN_CLASS: AiDataClass = "B";
const A = aiSite({ site: "writer-plan"${extra}, dataClass: WRITER_PLAN_CLASS, tier: "frontier" });
`;
    const root = await fixture({ "entities/campaigns/lib/writer/model.ts": step(', modelSite: "brand-writer"') });
    write(root, { "entities/campaigns/lib/writer/model.ts": step("") });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("writer-plan moved");
    expect(errors[0]).toContain("modelKey brand-writer");
    expect(errors[0]).toContain("modelKey writer-plan");
  });

  it("fails a class or provider change on a site", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") });
    write(root, { "entities/hiring/lib/resume-screen.ts": declared("B") });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("dataClass S");
    expect(errors[0]).toContain("dataClass B");
  });

  it("fails a site that changed file, since a fork's copy is pruned by the file it records", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") });
    fs.renameSync(path.join(root, "entities/hiring/lib/resume-screen.ts"), path.join(root, "entities/hiring/lib/screen.ts"));
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toEqual([
      expect.stringMatching(/^resume-screen is declared in entities\/hiring\/lib\/screen\.ts, but .* records it in entities\/hiring\/lib\/resume-screen\.ts/),
    ]);
  });

  it("fails one site name declared twice on two routes", async () => {
    const root = await fixture({
      "entities/a/lib/one.ts": `export const X_CLASS: AiDataClass = "B";\nconst A = aiSite({ site: "shared-site", dataClass: X_CLASS, tier: "fast" });\n`,
      "entities/b/lib/two.ts": `export const X_CLASS: AiDataClass = "B";\nconst A = aiSite({ site: "shared-site", dataClass: X_CLASS, tier: "standard" });\n`,
    });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toEqual([
      "entities/b/lib/two.ts:2: shared-site is declared again with a different route; one site name is one usage line and one set of env overrides.",
    ]);
  });

  it("fails when the baseline is missing, so deleting it cannot disarm the rule", async () => {
    const root = await fixture({ "entities/hiring/lib/resume-screen.ts": declared("S") }, { baseline: false });
    const { errors } = await checkAiRouting(root, {});
    expect(errors).toEqual([expect.stringContaining(`${BASELINE_FILE} is missing`)]);
  });

  it("refuses to write a baseline while a site cannot be read", async () => {
    const root = await fixture({ "entities/a/lib/none.ts": `const AI = aiSite({ site: "a-site", tier: "fast" });\n` }, { baseline: false });
    const res = await writeAiRoutingBaseline(root);
    expect(res.written).toBe(false);
    expect(fs.existsSync(path.join(root, BASELINE_FILE))).toBe(false);
  });

  it("records a site's eval-chosen host and fallback, and fails a fallback its class refuses (Y.67.3)", async () => {
    const route = `import type { AiDataClass } from "@/kernel/ai/routing";
export const ROADMAP_ASSIST_CLASS: AiDataClass = "C";
const AI = aiSite({ site: "roadmap-assist", dataClass: ROADMAP_ASSIST_CLASS, tier: "fast", routeSeconds: 60 });
`;
    const root = await fixture({ "entities/portal/api/portal/roadmap-assist/route.ts": route });
    const { errors, routes } = await checkAiRouting(root, {});
    expect(errors).toEqual([]);
    expect(routes["entities/portal/api/portal/roadmap-assist/route.ts"]["roadmap-assist"]).toMatchObject({
      model: "qwen/qwen3.8-flash",
      host: "alibaba",
      fallback: { model: "claude-sonnet-5", afterMs: 12000 },
    });
    // A class C site may not fall back to Fable, which Anthropic keeps for 30 days.
    // A fresh tree, because node caches the first tree's models.ts by its path.
    const models = fs.readFileSync(path.join(DEFAULT_ROOT, "kernel/ai/models.ts"), "utf8");
    const onFable = models.replace('fallback: { model: "claude-sonnet-5"', 'fallback: { model: "claude-fable-5-1"');
    expect(onFable).not.toBe(models);
    const refusedRoot = await fixture({ "kernel/ai/models.ts": onFable, "entities/portal/api/portal/roadmap-assist/route.ts": route }, { baseline: false });
    const refused = await checkAiRouting(refusedRoot, {});
    expect(refused.errors.some((e) => e.includes("roadmap-assist/route.ts:3: the fallback is refused") && e.includes("class C"))).toBe(true);
  });

  it("skips test files", async () => {
    const root = await fixture({ "entities/a/lib/thing.test.ts": `const MODEL = modelFor("x", "fast");\n` });
    expect((await checkAiRouting(root, {})).errors).toEqual([]);
  });
});
