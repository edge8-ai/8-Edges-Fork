// Tests for the portability gate and the exclude generator.
//
// The behaviour worth pinning is not "does it run" but the two failures that
// actually happened: an entity nobody classified shipped by default, and an
// exclusion that named a route body while its app/ mount stayed behind.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, validateManifest } from "./entity-manifest.mjs";
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

describe("the real tree", () => {
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
    const { above, stale } = ratchet(result.violations, loadBaseline(ROOT));
    expect(above.map(edgeKey)).toEqual([]);
    expect(stale).toEqual([]);
  });
});

describe("nonShippingMounts", () => {
  const manifest = loadManifest(ROOT);
  const mounts = nonShippingMounts(ROOT, manifest);

  it("derives the mounts of internal routes rather than listing them", () => {
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

  it("matches the committed generated file", () => {
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
