// Tests for the portability gate and the exclude generator.
//
// The behaviour worth pinning is not "does it run" but the two failures that
// actually happened: an entity nobody classified shipped by default, and an
// exclusion that named a route body while its app/ mount stayed behind.

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "./entity-manifest.mjs";
import { isForkTree } from "./fork-tree.mjs";
import {
  checkPortability,
  edgeKey,
  loadBaseline,
  nonShippingMounts,
  ratchet,
  shipBlocker,
  ships,
} from "./check-portability.mjs";
import { forkExcludes, render, GENERATED_FILE } from "./gen-fork-excludes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A manifest shaped like the real one, small enough to reason about. */
function fixture(overrides = {}) {
  return {
    kernel: { target: "kernel", current: ["kernel"], portability: "portable", tables: [] },
    entities: {
      site: { target: "entities/site", layer: 1, current: ["entities/site"], portability: "portable", tables: [] },
      secret: { target: "entities/secret", layer: 1, current: ["entities/secret"], portability: "internal", tables: ["s"] },
      mixed: {
        target: "entities/mixed",
        layer: 2,
        current: ["entities/mixed"],
        portability: "portable",
        internalPaths: ["lib/private.ts", "routes/hidden"],
        tables: [],
      },
      ...overrides,
    },
  };
}

describe("validateManifest", () => {
  it("refuses an entity with no portability decision", () => {
    const m = fixture();
    delete m.entities.site.portability;
    // The whole point: an unclassified entity must not reach the sync, where
    // the default is to ship it.
    expect(() => validateManifest(m)).toThrow(/portability must be/);
  });

  it("refuses a portability value that is neither portable nor internal", () => {
    const m = fixture();
    m.entities.site.portability = "maybe";
    expect(() => validateManifest(m)).toThrow(/portability must be/);
  });

  it("refuses internalPaths on an entity that is already internal", () => {
    const m = fixture();
    m.entities.secret.internalPaths = ["lib/x.ts"];
    expect(() => validateManifest(m)).toThrow(/internalPaths is redundant/);
  });

  it("refuses an ownedPath that points back inside entities/", () => {
    const m = fixture();
    m.entities.secret.ownedPaths = ["entities/secret/lib"];
    expect(() => validateManifest(m)).toThrow(/ownedPaths is for paths OUTSIDE/);
  });

  it("refuses an internalPath that escapes its entity", () => {
    const m = fixture();
    m.entities.mixed.internalPaths = ["../site/lib/x.ts"];
    expect(() => validateManifest(m)).toThrow(/entity-relative/);
  });

  it("accepts the real manifest", () => {
    expect(() => loadManifest(ROOT)).not.toThrow();
  });
});

describe("shipBlocker", () => {
  const m = fixture();

  it("ships the kernel and the composition root", () => {
    expect(ships("kernel/config/brand.ts", m)).toBe(true);
    expect(ships("app/page.tsx", m)).toBe(true);
  });

  it("blocks every file of an internal entity, and says which", () => {
    expect(shipBlocker("entities/secret/index.ts", m)).toMatch(/internal entity "secret"/);
    expect(shipBlocker("entities/secret/deep/nested/file.ts", m)).toMatch(/internal entity "secret"/);
  });

  it("blocks an internal path but not its siblings", () => {
    expect(shipBlocker("entities/mixed/lib/private.ts", m)).toMatch(/internal path/);
    expect(ships("entities/mixed/lib/public.ts", m)).toBe(true);
  });

  it("blocks a directory internalPath recursively", () => {
    expect(shipBlocker("entities/mixed/routes/hidden/page.tsx", m)).toMatch(/internal path/);
    expect(ships("entities/mixed/routes/shown/page.tsx", m)).toBe(true);
  });

  it("does not let a prefix match a longer sibling name", () => {
    // "routes/hidden" must not block "routes/hidden-in-plain-sight".
    expect(ships("entities/mixed/routes/hidden-in-plain-sight/page.tsx", m)).toBe(true);
  });

  it("covers a stem's extension siblings", () => {
    // lib/private.ts is named exactly; lib/private.test.ts rides the same rule.
    expect(shipBlocker("entities/mixed/lib/private.test.ts", m)).toMatch(/internal path/);
  });
});

// The gate is the upstream's; in the public fork it reports nothing to check.
describe.skipIf(isForkTree(ROOT))("the real tree", () => {
  const manifest = loadManifest(ROOT);
  const result = checkPortability(ROOT, manifest);

  it("walks a non-trivial number of files", () => {
    expect(result.files).toBeGreaterThan(500);
    expect(result.shipping).toBeGreaterThan(100);
  });

  it("does not ship the internal entities", () => {
    for (const [name, entity] of Object.entries(manifest.entities)) {
      if (entity.portability !== "internal") continue;
      expect(ships(`${entity.target}/index.ts`, manifest), name).toBe(false);
    }
  });

  it("has no violation above the baseline", () => {
    const { above, stale } = ratchet([...result.violations, ...result.tableReads], loadBaseline(ROOT));
    expect(above.map(edgeKey)).toEqual([]);
    expect(stale).toEqual([]);
  });
});

describe("nonShippingMounts", () => {
  const manifest = loadManifest(ROOT);
  const mounts = nonShippingMounts(ROOT, manifest);

  // In the public fork the sync has already removed those mounts.
  it.skipIf(isForkTree(ROOT))("derives the mounts of internal routes rather than listing them", () => {
    expect(mounts.size).toBeGreaterThan(0);
    for (const [mount, reason] of mounts) {
      expect(mount.startsWith("app/")).toBe(true);
      expect(reason).toMatch(/internal (entity|path)/);
    }
  });

  it("leaves a mount alone when what it mounts still ships", () => {
    // The admin dashboard home mounts a portable route body.
    expect(mounts.has("app/admin/(dashboard)/page.tsx")).toBe(false);
  });
});

describe("gen-fork-excludes", () => {
  const manifest = loadManifest(ROOT);
  const lines = forkExcludes(ROOT, manifest);

  it("excludes every internal entity's whole directory", () => {
    for (const [, entity] of Object.entries(manifest.entities)) {
      if (entity.portability !== "internal") continue;
      expect(lines).toContain(`${entity.target}/`);
    }
  });

  it("gives directories a trailing slash and files none", () => {
    for (const line of lines) {
      const bare = line.replace(/\/$/, "");
      if (!fs.existsSync(path.join(ROOT, bare))) continue;
      const isDir = fs.statSync(path.join(ROOT, bare)).isDirectory();
      // rsync silently matches nothing when a file carries a trailing slash,
      // which is how an "excluded" file ships anyway.
      expect(line.endsWith("/"), line).toBe(isDir);
    }
  });

  it("leaves no app/ mount behind for an excluded route body", () => {
    const covered = (rel) => lines.some((l) => rel === l || rel.startsWith(l.endsWith("/") ? l : `${l}/`));
    for (const mount of nonShippingMounts(ROOT, manifest).keys()) {
      expect(covered(mount), mount).toBe(true);
    }
  });

  it("excludes what an internal entity owns outside entities/", () => {
    // The two Deno functions that write htt.man_hour_entries are called
    // ingest-session-start and ingest-session-end. No name convention finds
    // those; they ship unless the manifest says whose they are.
    for (const [, entity] of Object.entries(manifest.entities)) {
      if (entity.portability !== "internal") continue;
      for (const owned of entity.ownedPaths ?? []) {
        expect(lines.some((l) => l.replace(/\/$/, "") === owned), owned).toBe(true);
      }
    }
  });

  // The generated exclude list is an input of the upstream's sync; .github/
  // does not reach the public fork.
  it.skipIf(isForkTree(ROOT))("matches the committed generated file", () => {
    const current = fs.readFileSync(path.join(ROOT, GENERATED_FILE), "utf8");
    expect(current).toBe(render(ROOT, manifest));
  });
});

describe("the ratchet", () => {
  const v = (importer, target) => ({ importer, target, reason: "internal entity \"x\"" });

  it("passes what the baseline holds and fails what it does not", () => {
    const baseline = new Set(["a.ts -> b.ts"]);
    const { above } = ratchet([v("a.ts", "b.ts"), v("c.ts", "d.ts")], baseline);
    expect(above.map(edgeKey)).toEqual(["c.ts -> d.ts"]);
  });

  it("fails a baseline entry that is no longer a violation, so it can only shrink", () => {
    const { stale } = ratchet([], new Set(["gone.ts -> also-gone.ts"]));
    expect(stale).toEqual(["gone.ts -> also-gone.ts"]);
  });
});

// The "fires" test (ADR 0033): the CLI is run with `--root` over a fixture tree
// holding one planted violation per rule the header claims, and over a clean
// twin that holds every shape the gate must let through. The import half's
// helpers are pinned above; this proves main() runs them, and it is the only
// proof of the table half, whose helper sat uncalled until ADR 0033.
describe("check-portability fires", () => {
  const SCRIPT = path.join(ROOT, "scripts", "check-portability.mjs");
  const MANIFEST = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: {
      shop: {
        target: "entities/shop",
        current: ["entities/shop"],
        portability: "portable",
        internalPaths: ["lib/private.ts"],
        tables: ["orders"],
        requires: [],
      },
      tracker: {
        target: "entities/tracker",
        current: ["entities/tracker"],
        portability: "internal",
        ownedPaths: ["supabase/functions/ingest"],
        tables: ["pull_requests", "repos"],
        requires: [],
      },
    },
  };
  // Every shape the gate must let through: a type-only import of the internal
  // entity, the entity's own internal path reading the internal table, the
  // internal entity reading its own tables, a test file and an ownedPaths file
  // reading them, an upstream file the fork overlay replaces, and app/shell.ts,
  // which the fork staging regenerates without the internal entity (ADR 0026,
  // decided 2026-10-29).
  const CLEAN = {
    "entities.manifest.json": JSON.stringify(MANIFEST),
    "kernel/db.ts": "export const db = {} as any;\n",
    "entities/shop/index.ts": 'export * from "./lib/orders";\nexport * from "./lib/hub";\n',
    "entities/shop/lib/orders.ts":
      'import type { Pr } from "@/entities/tracker";\nimport { db } from "@/kernel/db";\n\nexport const list = (): Pr[] => db.from("orders").select("id");\n',
    "entities/shop/lib/private.ts": 'import { db } from "@/kernel/db";\n\nexport const p = db.from("pull_requests").select("id");\n',
    "entities/shop/lib/orders.test.ts": 'import { db } from "@/kernel/db";\n\nconst mocked = db.from("pull_requests").select("id");\n',
    "entities/shop/lib/hub.ts":
      'import { prs } from "@/entities/tracker";\nimport { db } from "@/kernel/db";\n\nexport const h = [prs, db.from("repos").select("id")];\n',
    ".github/fork-overlay/entities/shop/lib/hub.ts": "export const h = null;\n",
    "app/shell.ts": 'import { prs as prsProvided } from "@/entities/tracker";\n\nexport const prs = prsProvided;\n',
    "entities/tracker/index.ts":
      'import { db } from "@/kernel/db";\n\nexport type Pr = { id: string };\nexport const prs = () => db.from("pull_requests").select("id, repo:repos(name)");\n',
    "supabase/functions/ingest/index.ts": 'import { db } from "../../../kernel/db.ts";\n\nexport const ingest = () => db.from("repos").insert({});\n',
  };
  const PLANTED = {
    // Shipping code importing an internal entity, from an entity and from the kernel.
    "entities/shop/lib/report.ts": 'import { prs } from "@/entities/tracker";\n\nexport const report = prs;\n',
    "kernel/feed.ts": 'import { prs } from "@/entities/tracker";\n\nexport const feed = prs;\n',
    // Shipping code importing its own entity's internal path.
    "entities/shop/lib/summary.ts": 'import { p } from "./private";\n\nexport const summary = p;\n',
    // Shipping code reading an internal table, by .from() and by an embed.
    "entities/shop/lib/stats.ts":
      'import { db } from "@/kernel/db";\n\nexport const a = db.from("pull_requests").select("id");\nexport const b = db.from("orders").select("id, repo:repos(name)");\n',
  };
  const EDGES = [
    'entities/shop/lib/report.ts -> entities/tracker/index.ts  (internal entity "tracker")',
    'kernel/feed.ts -> entities/tracker/index.ts  (internal entity "tracker")',
    'entities/shop/lib/summary.ts -> entities/shop/lib/private.ts  (internal path "shop:lib/private.ts")',
    'entities/shop/lib/stats.ts -> table pull_requests  (table of internal entity "tracker")',
    'entities/shop/lib/stats.ts -> table repos  (table of internal entity "tracker")',
  ];
  const keyOf = (line) => line.replace(/ {2}\(.*\)$/, "");

  const tmpDirs = [];
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });
  function tree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-portability-"));
    tmpDirs.push(root);
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
  }
  const baseline = (known) => ({ "scripts/portability-baseline.json": JSON.stringify({ known }) });
  function run(root) {
    const env = { ...process.env };
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    return spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8", env });
  }

  it("passes the clean twin", () => {
    const res = run(tree(CLEAN));
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("no new import reaches code that does not, and no new read reaches an internal table");
  });

  it("fails an import of an internal entity or path, and a read of an internal table, naming each", () => {
    const res = run(tree({ ...CLEAN, ...PLANTED }));
    expect(res.status).toBe(1);
    for (const line of EDGES) expect(res.stderr).toContain(line);
    expect(res.stderr).toContain("check-portability: 3 NEW import(s) from shipping code into code that does not ship");
    expect(res.stderr).toContain("check-portability: 2 NEW read(s) from shipping code of a table an internal entity owns");
  });

  it("holds what the baseline names with a reason, and fails an entry that is no longer a violation", () => {
    const known = EDGES.map((line) => ({ edge: keyOf(line), reason: "Predates the gate." }));
    const held = run(tree({ ...CLEAN, ...PLANTED, ...baseline(known) }));
    expect(held.status, held.stderr).toBe(0);
    expect(held.stdout).toContain("5 held by the baseline");

    const stale = run(tree({ ...CLEAN, ...baseline(known) }));
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain(`no longer a violation: ${keyOf(EDGES[3])}`);
  });

  it("checks every other file under app/: only app/shell.ts is regenerated in the fork", () => {
    // It also imports shipping code: an app/ file whose every import is internal
    // is a mount of an internal route, excluded with it (nonShippingMounts).
    const nav = 'import { prs } from "@/entities/tracker";\nimport { list } from "@/entities/shop";\n\nexport const nav = [prs, list];\n';
    const res = run(tree({ ...CLEAN, "app/nav.ts": nav }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('app/nav.ts -> entities/tracker/index.ts  (internal entity "tracker")');
    expect(res.stderr).not.toContain("app/shell.ts ->");
  });

  it("refuses a baseline entry that gives no reason", () => {
    const res = run(tree({ ...CLEAN, ...PLANTED, ...baseline([{ edge: keyOf(EDGES[3]), reason: " " }]) }));
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('an object entry needs an "edge" and a non-empty "reason"');
  });
});
