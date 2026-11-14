// Fires tests for scripts/check-signed-links.mjs (ADR 0033): each rule in its header is planted
// in a throwaway tree and the entry point must exit non-zero and name it, and a clean twin must
// pass. Every run passes its fixture root with `--root`, never the working directory: git hooks
// export GIT_DIR, and a test that leans on the cwd can end up reading the real repository.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { BASELINE_FILE, OWNERS } from "./check-signed-links.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-signed-links.mjs");
const SIGNS = `export const open = (p: string) => bucket.createSignedUrl(p, 60);\n`;
const SIGNS_TWICE = `export const open = (p: string) => bucket.createSignedUrl(p, 60);\nexport const all = (p: string[]) => bucket.createSignedUrls(p, 60);\n`;
// The clean twin: both owners sign, and nothing else does.
const CLEAN = Object.fromEntries(OWNERS.map((owner) => [owner, SIGNS_TWICE]));

const tmpDirs = [];
function fixture(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "signed-links-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries({ ...CLEAN, ...files })) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  if (baseline) {
    fs.mkdirSync(path.dirname(path.join(root, BASELINE_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root, BASELINE_FILE), JSON.stringify(baseline));
  }
  return root;
}
function run(root, ...args) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync("node", [SCRIPT, "--root", root, ...args], { encoding: "utf8", env });
}
const baselineOf = (root) => JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), "utf8"));
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("check-signed-links", () => {
  it("passes the clean twin: signing inside the owner modules", () => {
    const res = run(fixture({}));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("0 signing call(s)");
  });

  it("rule 1: fails a file outside an owner module that signs a link, and names it", () => {
    const res = run(fixture({ "entities/crm/lib/agreement-links.ts": SIGNS }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("entities/crm/lib/agreement-links.ts: signs a storage link 1 time(s) outside an owner module");
  });

  it("rule 1: counts the method taken into a variable, and a route under app/, as signing", () => {
    const res = run(fixture({ "app/api/x/route.ts": `const sign = bucket.createSignedUrls;\nexport const GET = () => sign(["p"], 60);\n` }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("app/api/x/route.ts");
  });

  it("rule 1: counts a .tsx file too", () => {
    const res = run(fixture({ "entities/crm/ui/AgreementLink.tsx": `export const A = () => <a href={bucket.createSignedUrl("p", 60)} />;\n` }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("entities/crm/ui/AgreementLink.tsx");
  });

  it("does not count a comment, a test, the kernel's test double, or an upload token", () => {
    const res = run(
      fixture({
        "entities/crm/lib/notes.ts": `// bucket.createSignedUrl(p, 60) was here\n/* createSignedUrls */\nexport const n = 1;\n`,
        "entities/crm/lib/notes.test.ts": SIGNS,
        "entities/crm/lib/__tests__/links.ts": SIGNS,
        "kernel/data/testing/fake-storage.ts": `export const OPS = ["createSignedUrl", "createSignedUrls"];\n`,
        "entities/crm/lib/upload.ts": `export const start = (p: string) => bucket.createSignedUploadUrl(p);\n`,
      }),
    );
    expect(res.status).toBe(0);
  });

  it("rule 2: fails a baselined file whose count rises above its entry", () => {
    const res = run(fixture({ "entities/boards/lib/files.ts": SIGNS_TWICE }, { "entities/boards/lib/files.ts": 1 }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("entities/boards/lib/files.ts: signs a storage link 2 time(s), baseline 1");
  });

  it("passes a baselined file at its entry", () => {
    expect(run(fixture({ "entities/boards/lib/files.ts": SIGNS }, { "entities/boards/lib/files.ts": 1 })).status).toBe(0);
  });

  it("rule 3: fails a stale entry until it is lowered, then passes", () => {
    const root = fixture({ "entities/boards/lib/files.ts": SIGNS }, { "entities/boards/lib/files.ts": 2, "entities/gone/lib/old.ts": 1 });
    const res = run(root);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("entities/boards/lib/files.ts: signs a storage link 1 time(s), baseline 2. Stale");
    expect(res.stderr).toContain("entities/gone/lib/old.ts: signs a storage link 0 time(s), baseline 1. Stale");
    expect(run(root, "--write-baseline").status).toBe(0);
    expect(baselineOf(root)).toEqual({ "entities/boards/lib/files.ts": 1 });
    expect(run(root).status).toBe(0);
  });

  it("rule 4: --write-baseline refuses to raise a count, and writes nothing", () => {
    const root = fixture({ "entities/crm/lib/agreement-links.ts": SIGNS }, { "entities/boards/lib/files.ts": 1 });
    const res = run(root, "--write-baseline");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("would raise entities/crm/lib/agreement-links.ts 0 -> 1");
    expect(baselineOf(root)).toEqual({ "entities/boards/lib/files.ts": 1 });
  });

  it("in the public fork, a fall is not a failure but a new signing call still is", () => {
    const fork = { "supabase/01-schema.sql": "-- the fork's schema\n" };
    expect(run(fixture(fork, { "entities/gone/lib/old.ts": 1 })).status).toBe(0);
    expect(run(fixture({ ...fork, "entities/crm/lib/agreement-links.ts": SIGNS })).status).toBe(1);
    const rise = run(fixture({ ...fork, "entities/boards/lib/files.ts": SIGNS_TWICE }, { "entities/boards/lib/files.ts": 1 }));
    expect(rise.status).toBe(1);
    expect(rise.stderr).toContain("entities/boards/lib/files.ts: signs a storage link 2 time(s), baseline 1");
  });
});
