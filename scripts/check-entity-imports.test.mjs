// Exercises scripts/check-entity-imports.mjs against throwaway fixture trees,
// each with its own entities.manifest.json, so the assertions hold however the
// real repo moves. The real repo is checked by the gate itself.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkEntityImports,
  collectEdges,
  importSpecifiers,
  isEntityDoor,
  isMountTarget,
  measure,
  resolveSpecifier,
} from "./check-entity-imports.mjs";

// The post-ME-13 shape: every owner's `current` is its target and app/ is the
// composition root.
const MANIFEST = {
  kernel: { target: "kernel", current: ["kernel"] },
  entities: {
    site: { target: "entities/site", portability: "portable", current: ["entities/site"] },
    team: { target: "entities/team", portability: "portable", current: ["entities/team"] },
  },
};

const tmpDirs = [];
function fixture(files, manifest = MANIFEST) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "entity-imports-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest));
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("importSpecifiers", () => {
  it("finds static, dynamic, bare and re-export specifiers", () => {
    const src = `import a from "@/kernel/a";
export { b } from './b';
const c = await import("../c");
import "@/styles.css";
const d = require("@/kernel/d");
`;
    expect(importSpecifiers(src).sort()).toEqual(["../c", "./b", "@/kernel/a", "@/kernel/d", "@/styles.css"]);
  });

  it("does not see a commented-out or documented import", () => {
    const src = `// import old from "@/kernel/old";\n/* import { x } from "@/kernel/x"; */\nimport a from "@/kernel/a"; // see "@/kernel/b"\n`;
    expect(importSpecifiers(src)).toEqual(["@/kernel/a"]);
  });
});

describe("resolveSpecifier", () => {
  it("maps the @/ alias to the repo root and strips extension and /index", () => {
    expect(resolveSpecifier("@/entities/team/lib/data.ts", "app/x.ts")).toBe("entities/team/lib/data");
    expect(resolveSpecifier("@/entities/team/index", "app/x.ts")).toBe("entities/team");
  });
  it("resolves relative specifiers against the importer", () => {
    expect(resolveSpecifier("../lib/blog", "entities/site/routes/page.tsx")).toBe("entities/site/lib/blog");
    expect(resolveSpecifier("./data", "entities/team/index.ts")).toBe("entities/team/data");
  });
  it("ignores packages", () => {
    expect(resolveSpecifier("react", "app/x.ts")).toBeNull();
    expect(resolveSpecifier("@supabase/ssr", "app/x.ts")).toBeNull();
  });
});

describe("doors and mounts", () => {
  it("knows an entity's two doors and nothing beside them", () => {
    expect(isEntityDoor("entities/site", MANIFEST)).toBe(true);
    expect(isEntityDoor("entities/site/client", MANIFEST)).toBe(true);
    expect(isEntityDoor("entities/site/ui/Widget", MANIFEST)).toBe(false);
    expect(isEntityDoor("kernel", MANIFEST)).toBe(false);
  });

  it("knows the three directories app/ may mount", () => {
    expect(isMountTarget("entities/site/routes/about/page", MANIFEST)).toBe(true);
    expect(isMountTarget("entities/site/api/contact/route", MANIFEST)).toBe(true);
    expect(isMountTarget("entities/team/crons/coaching-cycle", MANIFEST)).toBe(true);
    expect(isMountTarget("entities/site/lib/blog", MANIFEST)).toBe(false);
    expect(isMountTarget("entities/site/routes", MANIFEST)).toBe(false);
  });
});

describe("collectEdges and measure", () => {
  it("counts only cross-entity, non-kernel, non-door imports", () => {
    const root = fixture({
      "entities/team/routes/page.tsx": `import "@/entities/team/lib/data";
import "@/entities/site";
import "@/entities/site/client";
import "@/kernel/config/env";
import "@/entities/site/index";
import "@/entities/site/internal";
`,
      "entities/team/lib/data.ts": `import "./helpers";\nimport "@/entities/site/lib/posts";\n`,
      "entities/team/lib/helpers.ts": "",
      "entities/site/lib/posts.ts": "",
    });
    const edges = collectEdges(root);
    expect(edges.map((e) => `${e.importer}->${e.target}`).sort()).toEqual([
      "entities/team/lib/data.ts->entities/site/lib/posts",
      "entities/team/routes/page.tsx->entities/site/internal",
    ]);
    expect(measure(root)).toEqual({ "team->site": 2 });
  });

  it("lets the composition root mount routes, api and crons, and nothing else of an entity", () => {
    // Design §3 rule 1: app/ is a tree of thin mounts. A mount re-exports a
    // route body, handler or cron; reaching into lib/ or ui/ is an edge.
    const root = fixture({
      "app/about/page.tsx": 'export { default } from "@/entities/site/routes/about/page";\n',
      "app/api/contact/route.ts": 'export { POST } from "@/entities/site/api/contact/route";\n',
      "app/api/cron/x/route.ts": 'export { GET } from "@/entities/team/crons/x";\n',
      "app/layout.tsx": 'import { SiteFrame } from "@/entities/site";\nimport "@/entities/site/ui/Nav";\n',
      "entities/site/routes/about/page.tsx": "",
      "entities/site/api/contact/route.ts": "",
      "entities/team/crons/x.ts": "",
      "entities/site/index.ts": "",
      "entities/site/ui/Nav.tsx": "",
    });
    expect(collectEdges(root).map((e) => `${e.importer}->${e.target}`)).toEqual(["app/layout.tsx->entities/site/ui/Nav"]);
    expect(measure(root)).toEqual({ "app->site": 1 });
  });

  it("does not extend the mount allowance to another entity", () => {
    const root = fixture({
      "entities/team/routes/page.tsx": 'import "@/entities/site/routes/about/page";\n',
      "entities/site/routes/about/page.tsx": "",
    });
    expect(measure(root)).toEqual({ "team->site": 1 });
  });

  it("skips test files, which import across seams on purpose", () => {
    const root = fixture({
      "entities/team/lib/data.test.ts": 'import "@/entities/site/lib/x";\n',
      "app/__tests__/x.ts": 'import "@/entities/site/lib/x";\n',
      "entities/site/lib/x.ts": "",
    });
    expect(measure(root)).toEqual({});
  });

  it("attributes unclaimed files so a manifest gap is visible", () => {
    const root = fixture({ "entities/mystery/x.ts": 'import "@/entities/team/lib/data";\n', "entities/team/lib/data.ts": "" });
    expect(measure(root)).toEqual({ "unassigned->team": 1 });
  });
});

describe("the gate", () => {
  it("passes a tree whose only cross-entity imports are doors and mounts", () => {
    const root = fixture({
      "app/page.tsx": 'export { default } from "@/entities/site/routes/page";\n',
      "entities/site/routes/page.tsx": 'import "@/entities/team";\nimport "@/kernel/ui/Badge";\n',
      "entities/team/index.ts": "",
    });
    expect(checkEntityImports(root).violations).toEqual([]);
  });

  it("fails on a single edge — there is no baseline to hide behind", () => {
    const root = fixture({
      "entities/team/lib/data.ts": 'import "@/entities/site/lib/blog";\n',
      "entities/site/lib/blog.ts": "",
    });
    expect(checkEntityImports(root).violations).toEqual([
      "team->site: 1 cross-entity import(s) outside the owner's doors",
    ]);
  });
});
