// The "fires" test for scripts/check-entity-layers-walk.mjs (ADR 0033). The
// walk has no entry point of its own: check-requires is the gate that runs it,
// so that gate's CLI is run with `--root` over a fixture tree. Entity `a`
// reaches one other entity through each import form the walk claims is an
// edge, and reaches `g` only through forms it claims are erased. The planted
// tree declares nothing and must name every real edge; the clean twin declares
// exactly the real edges and must pass, which it can only do if every erased
// form really is erased (a counted one would fail as "a reaches g's door").

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-requires.mjs");

const DOOR = "export const x = 1;\n";
const FILES = {
  // The door re-exports the entity's own lib files, so the walk must follow
  // them; widget.tsx also proves a bare specifier resolves to a .tsx file.
  "entities/a/index.ts": 'export * from "./lib/server";\nexport { w } from "./ui/widget";\n',
  "entities/a/lib/server.ts": [
    // b: a dynamic import.
    'export const load = () => import("@/entities/b");',
    // c: a side-effect import of a client door.
    'import "@/entities/c/client";',
    // d: a re-export from another entity's door.
    'export { x as dx } from "@/entities/d";',
    // A type alias before a value import: erasing `export type` must stop at
    // its own statement and not swallow the import of f below it.
    "export type Shape = { a: number };",
    'import { x as fx } from "@/entities/f";',
    "export const f = fx;",
    // g: every form the walk claims is erased, so none of these is an edge.
    'import type { T } from "@/entities/g";',
    'export type { T as U } from "@/entities/g";',
    'import { type T as V, type W } from "@/entities/g";',
    '// import { x } from "@/entities/g";',
    '/* import { x } from "@/entities/g"; */',
    "",
  ].join("\n"),
  // e: a relative specifier from a .tsx file, resolved to the door's client.ts.
  "entities/a/ui/widget.tsx": 'import { x } from "../../e/client";\nexport const w = x;\n',
  "entities/b/index.ts": DOOR,
  "entities/c/client.ts": DOOR,
  "entities/d/index.ts": DOOR,
  "entities/e/client.ts": DOOR,
  "entities/f/index.ts": DOOR,
  "entities/g/index.ts": "export type T = string;\nexport type W = number;\nexport const x = 1;\n",
};
const REACHED = ["b", "c", "d", "e", "f"];

const tmpDirs = [];
function fixture(requiresOfA) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "layers-walk-"));
  tmpDirs.push(root);
  // Each edge is a hard need: this test is about the walk, and ADR 0032's
  // kinds have their own fires test (check-requires-kinds.test.mjs).
  const entity = (name, requires = []) => ({
    target: `entities/${name}`,
    current: [`entities/${name}`],
    tables: [],
    portability: "portable",
    requires: Object.fromEntries(requires.map((to) => [to, { kind: "hard", why: "fixture" }])),
  });
  const manifest = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: {
      a: entity("a", requiresOfA),
      ...Object.fromEntries(["b", "c", "d", "e", "f", "g"].map((n) => [n, entity(n)])),
    },
  };
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, body] of Object.entries(FILES)) {
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
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("check-entity-layers-walk fires, through check-requires", () => {
  it("counts a dynamic, side-effect, re-exported, relative and post-type-alias import as an edge", () => {
    const res = run(fixture([]));
    expect(res.status).toBe(1);
    for (const to of REACHED) expect(res.stderr).toContain(`a reaches ${to}'s door but does not require it`);
    expect(res.stderr).not.toContain("a reaches g's door");
    expect(res.stderr).toContain(`check-requires: ${REACHED.length} problem(s)`);
  });

  it("passes the clean twin, so no type-only or commented-out import of g was counted", () => {
    const res = run(fixture(REACHED));
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("every door import declared");
  });
});
