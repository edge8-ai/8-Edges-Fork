// Exercises scripts/check-requires.mjs against throwaway fixture trees, plus a
// few assertions against the real manifest. The fixtures matter more than the
// real tree here: a gate that only ever sees a passing repo is not known to
// fail, and every rule below closed a hole the old layer numbers could not see.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkRequires, layersOf, reachedDoors, MANDATORY } from "./check-requires.mjs";

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A tree of { relPath: contents } plus a manifest, written to a temp dir. */
function fixture(entities, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "requires-"));
  temps.push(root);
  const manifest = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: Object.fromEntries(
      Object.entries(entities).map(([name, e]) => [
        name,
        { target: `entities/${name}`, current: [`entities/${name}`], tables: [], portability: "portable", ...e },
      ]),
    ),
  };
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return { root, manifest };
}

const DOOR = (imports = "") => `${imports}export const x = 1;\n`;

describe("check-requires", () => {
  it("passes when an entity declares the door it reaches", () => {
    const { root, manifest } = fixture(
      { a: { requires: ["b"] }, b: {} },
      { "entities/a/index.ts": DOOR('import { x } from "@/entities/b";\n'), "entities/b/index.ts": DOOR() },
    );
    expect(checkRequires(root, manifest).problems).toEqual([]);
  });

  it("fails an undeclared door import, because the catalogue would understate the install", () => {
    const { root, manifest } = fixture(
      { a: {}, b: {} },
      { "entities/a/index.ts": DOOR('import { x } from "@/entities/b";\n'), "entities/b/index.ts": DOOR() },
    );
    const { problems } = checkRequires(root, manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/a reaches b's door but does not require it/);
  });

  it("fails a declared requirement nothing reaches, because the catalogue would overstate it", () => {
    const { root, manifest } = fixture(
      { a: { requires: ["b"] }, b: {} },
      { "entities/a/index.ts": DOOR(), "entities/b/index.ts": DOOR() },
    );
    const { problems } = checkRequires(root, manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/a requires b but never reaches its door/);
  });

  it("fails a cycle, because neither entity is then a unit of installation", () => {
    const { root, manifest } = fixture(
      { a: { requires: ["b"] }, b: { requires: ["a"] } },
      {
        "entities/a/index.ts": DOOR('import { x } from "@/entities/b";\n'),
        "entities/b/index.ts": DOOR('import { x } from "@/entities/a";\n'),
      },
    );
    const { problems } = checkRequires(root, manifest);
    expect(problems.some((p) => /requires cycle/.test(p))).toBe(true);
  });

  it("fails a portable entity that requires an internal one (ADR 0001)", () => {
    const { root, manifest } = fixture(
      { a: { requires: ["b"], portability: "portable" }, b: { portability: "internal" } },
      { "entities/a/index.ts": DOOR('import { x } from "@/entities/b";\n'), "entities/b/index.ts": DOOR() },
    );
    const { problems } = checkRequires(root, manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/portable but requires b, which is internal/);
  });

  it("lets an internal entity require a portable one", () => {
    const { root, manifest } = fixture(
      { a: { requires: ["b"], portability: "internal" }, b: { portability: "portable" } },
      { "entities/a/index.ts": DOOR('import { x } from "@/entities/b";\n'), "entities/b/index.ts": DOOR() },
    );
    expect(checkRequires(root, manifest).problems).toEqual([]);
  });

  it("does not ask the mandatory set to be declared", () => {
    const name = MANDATORY[0];
    const { root, manifest } = fixture(
      { a: {}, [name]: {} },
      { "entities/a/index.ts": DOOR(`import { x } from "@/entities/${name}";\n`), [`entities/${name}/index.ts`]: DOOR() },
    );
    expect(checkRequires(root, manifest).problems).toEqual([]);
  });

  // Real doors are barrels: `export * from "./lib/x"`, and the cross-entity
  // import sits in lib/x. A walk that only read `import` statements, or only
  // the door file itself, would measure every real entity as reaching nothing
  // and pass vacuously — so the chain is pinned with the shape the repo uses.
  it("follows a barrel's re-exports into lib files, and walks client.ts as a door too", () => {
    const { root, manifest } = fixture(
      { a: {}, b: {}, c: {} },
      {
        "entities/a/index.ts": 'export * from "./lib/server";\n',
        "entities/a/lib/server.ts": 'import { x } from "@/entities/b";\nexport const y = x;\n',
        "entities/a/client.ts": 'export { z } from "./ui/widget";\n',
        "entities/a/ui/widget.tsx": 'import { x } from "../../c/client";\nexport const z = x;\n',
        "entities/b/index.ts": DOOR(),
        "entities/c/client.ts": DOOR(),
      },
    );
    expect([...reachedDoors(root, manifest).a].sort()).toEqual(["b", "c"]);
    const { problems } = checkRequires(root, manifest);
    expect(problems.some((p) => /a reaches b's door but does not require it/.test(p))).toBe(true);
    expect(problems.some((p) => /a reaches c's door but does not require it/.test(p))).toBe(true);
  });

  it("ignores a type-only import, which is erased and pulls nothing in", () => {
    const { root, manifest } = fixture(
      { a: {}, b: {} },
      { "entities/a/index.ts": DOOR('import type { T } from "@/entities/b";\n'), "entities/b/index.ts": DOOR() },
    );
    expect(checkRequires(root, manifest).problems).toEqual([]);
  });

  it("derives the order as the longest chain to an entity that requires nothing", () => {
    const layers = layersOf({ entities: { a: { requires: ["b"] }, b: { requires: ["c"] }, c: { requires: [] } } });
    expect(layers).toEqual({ a: 3, b: 2, c: 1 });
  });
});

describe("the real manifest", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "entities.manifest.json"), "utf8"));

  it("carries no hand-written layer any more", () => {
    for (const [name, entity] of Object.entries(manifest.entities)) {
      expect(entity.layer, `${name} still has a layer; the order is derived now`).toBeUndefined();
    }
  });

  it("declares requires for every entity and passes its own gate", () => {
    for (const [name, entity] of Object.entries(manifest.entities)) {
      expect(Array.isArray(entity.requires), `${name} has no requires array`).toBe(true);
    }
    expect(checkRequires(root, manifest).problems).toEqual([]);
  });

  it("measures a door graph that is not vacuous", () => {
    const reached = reachedDoors(root, manifest);
    expect(Object.values(reached).some((s) => s.size > 0)).toBe(true);
  });
});
