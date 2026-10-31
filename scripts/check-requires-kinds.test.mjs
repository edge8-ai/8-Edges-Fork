// The "fires" test for check-requires' edge-kind rule (ADR 0032, in the style
// of ADR 0033): its entry point is run with `--root` over a fixture tree with
// one edge planted per way of not saying what kind of need it is, and over a
// clean twin that must pass. The CLI never runs against the working directory:
// git hooks export GIT_DIR, and a test that leans on the cwd can end up
// reading the real repository.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-requires.mjs");

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A tree where entity a's door imports entity b's, with a's `requires` as given. */
function fixture(requires) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "requires-kinds-"));
  temps.push(root);
  const entity = (name, extra = {}) => ({ target: `entities/${name}`, current: [`entities/${name}`], tables: [], portability: "portable", ...extra });
  const manifest = { kernel: { target: "kernel", current: ["kernel"], tables: [] }, entities: { a: entity("a", { requires }), b: entity("b", { requires: {} }) } };
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, body] of Object.entries({
    "entities/a/index.ts": 'import { x } from "@/entities/b";\nexport const y = x;\n',
    "entities/b/index.ts": "export const x = 1;\n",
  })) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

function run(root) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8", env });
}

describe("check-requires fires on an edge that does not say what kind of need it is", () => {
  it("passes a clean tree: the edge names its kind and why", () => {
    const res = run(fixture({ b: { kind: "hard", why: "a cannot do its job without b" } }));
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("every door import declared");
  });

  it("fails an edge with no kind", () => {
    const res = run(fixture({ b: { why: "a reads b" } }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("a requires b without a kind");
  });

  it("fails an edge whose kind is not one of ADR 0032's, or is a contract", () => {
    const unknown = run(fixture({ b: { kind: "nice-to-have", why: "a reads b" } }));
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("a requires b without a kind");
    const contract = run(fixture({ b: { kind: "contract", why: "a reads b" } }));
    expect(contract.status).toBe(1);
    expect(contract.stderr).toContain("a contract across a deployment boundary is never an import");
  });

  it("fails an edge that says no why", () => {
    const res = run(fixture({ b: { kind: "hard", why: " " } }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("a requires b without saying why");
  });

  it("fails a bare list of names, which states no kind for any edge", () => {
    const res = run(fixture(["b"]));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("a requires b without a kind");
  });
});
