// Exercises scripts/entity-manifest.mjs against a small in-memory manifest,
// plus one check that the real manifest loads and covers the tree's top-level
// source directories without leaving stray files unassigned outside app/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  APP_ROOT,
  KERNEL,
  UNASSIGNED,
  entityOf,
  entryMatches,
  loadManifest,
  validateManifest,
} from "./entity-manifest.mjs";

const SMALL = {
  kernel: { target: "kernel", current: ["lib/env", "lib/admin/format", "components/admin/Badge"] },
  entities: {
    site: { target: "entities/site", portability: "portable", current: ["app/page.tsx", "app/about", "lib/blog"] },
    "company-os": { target: "entities/company-os", portability: "portable", modules: ["crm"], current: ["app/admin", "lib/admin"] },
  },
};

describe("entryMatches", () => {
  it("matches a directory entry for everything beneath it", () => {
    expect(entryMatches("app/about", "app/about/page.tsx")).toBe(true);
    expect(entryMatches("app/about", "app/about-us/page.tsx")).toBe(false);
  });
  it("matches a stem entry for its extension siblings", () => {
    expect(entryMatches("lib/env", "lib/env.ts")).toBe(true);
    expect(entryMatches("lib/env", "lib/env.test.ts")).toBe(true);
    expect(entryMatches("lib/env", "lib/environment.ts")).toBe(false);
  });
  it("matches a file entry exactly only", () => {
    expect(entryMatches("app/page.tsx", "app/page.tsx")).toBe(true);
    expect(entryMatches("app/page.tsx", "app/page.tsx.bak")).toBe(false);
  });
});

describe("entityOf", () => {
  it("resolves by longest prefix so a kernel file inside an entity directory wins", () => {
    expect(entityOf("lib/admin/format.ts", SMALL)).toBe(KERNEL);
    expect(entityOf("lib/admin/contacts.ts", SMALL)).toBe("company-os");
    expect(entityOf("components/admin/Badge.tsx", SMALL)).toBe(KERNEL);
  });
  it("resolves target paths before any move happens", () => {
    expect(entityOf("entities/site/index.ts", SMALL)).toBe("site");
    expect(entityOf("kernel/data/supabase.ts", SMALL)).toBe(KERNEL);
  });
  it("gives unclaimed app files to the composition root and everything else to unassigned", () => {
    expect(entityOf("app/layout.tsx", SMALL)).toBe(APP_ROOT);
    expect(entityOf("lib/mystery.ts", SMALL)).toBe(UNASSIGNED);
  });
});

describe("validateManifest", () => {
  it("rejects a path claimed by two owners", () => {
    const bad = { kernel: { target: "kernel", current: ["lib/x"] }, entities: { a: { target: "entities/a", portability: "portable", current: ["lib/x"] } } };
    expect(() => validateManifest(bad)).toThrow(/claimed by both/);
  });
  it("rejects an entity without a target", () => {
    expect(() => validateManifest({ kernel: { target: "kernel" }, entities: { a: {} } })).toThrow(/target/);
  });
});

describe("the real manifest", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = loadManifest(root);

  // Nine at ME-01; FS-03 split time-off out of team and RS-01 split boards,
  // contacts and client-programs out of company-os and portal and RS-03 split finance, and RB added reimbursements (2026-10-07), the entities added by
  // the pluggable-entities work (docs/engineering/2026-09-08-pluggable-entities-spec.md).
  it("names the entities from the design doc", () => {
    expect(Object.keys(manifest.entities).sort()).toEqual(
      ["assistant", "billing", "boards", "campaigns", "client-programs", "coaching", "company-os", "contacts", "crm", "finance", "hiring", "htt", "ideas", "library", "notifications", "onboarding", "org", "portal", "reimbursements", "retreats", "site", "team", "time-off"],
    );
  });

  it("has no lib/ or components/ directory left to assign (ME-13)", () => {
    expect(fs.existsSync(path.join(root, "lib"))).toBe(false);
    expect(fs.existsSync(path.join(root, "components"))).toBe(false);
  });

  it("leaves no source file under entities/ or kernel/ unassigned", () => {
    const unassigned = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && entityOf(rel, manifest) === UNASSIGNED) unassigned.push(rel);
      }
    };
    walk("entities");
    walk("kernel");
    expect(unassigned).toEqual([]);
  });

  it("resolves every file under app/ to the composition root, since ME-13 moved all code out", () => {
    const owners = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(ts|tsx)$/.test(entry.name)) owners.add(entityOf(rel, manifest));
      }
    };
    walk("app");
    expect([...owners]).toEqual([APP_ROOT]);
  });
});
