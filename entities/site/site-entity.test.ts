import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural guard for the site entity (ME-07, docs/engineering/2026-09-03-multi-entity-design.md).
//
// The public marketing site is the first entity to move out of app/ and lib/. Its
// acceptance criteria are structural, not behavioural — the pages render the same
// HTML either way — so they are asserted here rather than left to review:
//
//   1. the entity has the index.ts / tables.ts surface every entity gets (design §2);
//   2. tables.ts agrees with entities.manifest.json, which the ownership ratchet reads;
//   3. nothing in the entity imports an auth guard (the site is the one unguarded
//      entity, and a guard appearing here would mean a page moved in by mistake);
//   4. nothing in the entity imports route code from app/ (design §3 rule 3, also an
//      ESLint zone — repeated here so a `git mv` that outruns lint still fails);
//   5. every app/ file that mounts the site is a thin re-export of the entity,
//      carrying only Next route-segment config and the stylesheet order (design §2:
//      "app/ thin: each file is `export { default } from '@/entities/x/routes/y'`");
//   6. no old lib/ path exists any more (ME-13 deleted the shims), and the entity
//      reaches another entity only through its doors.

const ROOT = path.resolve(__dirname, "..", "..");
const ENTITY = path.join(ROOT, "entities", "site");

type Manifest = {
  entities: Record<string, { tables?: string[] }>;
};

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const site = manifest.entities.site;

/** Every file under `dir`, repo-relative, depth-first. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [path.relative(ROOT, dir)];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => filesUnder(path.join(dir, e.name)));
}

/** Repo-relative paths of the entity's .ts/.tsx/.js sources, tests excluded. */
function entitySources(): string[] {
  return filesUnder(ENTITY).filter(
    (f) => /\.(ts|tsx|js)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
}

/**
 * Module specifiers named by `import ... from "x"`, `export ... from "x"`,
 * `import "x"` or `require("x")` — the last because ogRender is CommonJS.
 */
function moduleSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/**
 * Source with comments blanked out. The guard check reads identifiers, and
 * several modules mention `requireAdmin()` in a comment to say which caller is
 * expected to have run it — a sentence about a guard is not a dependency on one.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("site entity surface", () => {
  it("has an index and a tables declaration", () => {
    expect(fs.existsSync(path.join(ENTITY, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ENTITY, "tables.ts"))).toBe(true);
  });

  it("declares exactly the tables the manifest gives it", async () => {
    const { SITE_TABLES } = await import("./tables");
    expect([...SITE_TABLES].sort()).toEqual([...(site.tables ?? [])].sort());
  });
});

describe("site entity boundaries", () => {
  // The site is public: no admin, team, portal or signed-token gate belongs in
  // it. kernel/identity/writes.ts is the kernel's people writer, not a gate —
  // the careers and unsubscribe flows update a person row through it (ME-13).
  const GUARDS =
    /\b(requireAdmin|requireSuperAdmin|requireTeamMember|requirePortalMember|boardActorFor)\b|@\/kernel\/identity\/(?!writes\b)|@\/lib\/(admin-auth|team-auth|portal-auth|access-gate|signed-token)/;

  it("imports no auth guard", () => {
    const offenders = entitySources().filter((f) => GUARDS.test(withoutComments(read(f))));
    expect(offenders).toEqual([]);
  });

  it("reaches another entity only through its doors, and no old lib/ or components/ path", () => {
    // Design §3 rule 2, repeated here so a `git mv` that outruns lint still fails.
    const offenders = new Set<string>();
    for (const f of entitySources()) {
      for (const s of moduleSpecifiers(read(f))) {
        if (!s.startsWith("@/")) continue;
        if (s.startsWith("@/entities/site/") || s === "@/entities/site" || s.startsWith("@/kernel/")) continue;
        if (/^@\/entities\/[a-z-]+(\/client)?$/.test(s)) continue;
        offenders.add(`${f} -> ${s}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("imports no route code from app/", () => {
    const offenders = entitySources().filter((f) =>
      moduleSpecifiers(read(f)).some((s) => s.startsWith("@/app/") || s === "@/app"),
    );
    expect(offenders).toEqual([]);
  });
});

describe("app/ mounts the site entity without holding its code", () => {
  // Since ME-13 the manifest no longer lists app/ paths (app/ is the composition
  // root), so the mounts are found by what they import: any app/ file that names
  // one of the site's routes/, api/ or crons/ bodies mounts it. (The root layout
  // takes the site chrome from the door and composes other entities too; it is
  // not a mount.)
  const mountFiles = filesUnder(path.join(ROOT, "app"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$|__tests__/.test(f))
    .filter((f) => moduleSpecifiers(read(f)).some((s) => /^@\/entities\/site\/(routes|api|crons)\//.test(s)))
    .sort();

  it("finds the site's app/ files", () => {
    expect(mountFiles.length).toBeGreaterThan(50);
  });

  it.each(mountFiles)("%s only re-exports the entity", (rel) => {
    const source = read(rel);
    const foreign = moduleSpecifiers(source).filter(
      (s) =>
        !s.startsWith("@/entities/site") &&
        // Stylesheets stay in app/: nothing outside app/ imports CSS in this repo,
        // and the cascade order of a route sheet against app/styles/* is part of the
        // rendered page. The layout keeps both imports, in their original order.
        !s.endsWith(".css") &&
        // `import type { Metadata } from "next"` is type-only route plumbing.
        s !== "next" &&
        !s.startsWith("next/"),
    );
    expect(foreign, `${rel} still imports non-entity code`).toEqual([]);
    expect(/<[A-Za-z]/.test(source), `${rel} still holds JSX`).toBe(false);
  });
});

describe("no old path exists", () => {
  // ME-13 deleted every lib/ and components/ shim; callers import the entity's
  // doors or, inside the entity, the concrete file. A path reappearing here
  // would be a shim creeping back.
  it.each(["lib", "components"])("%s/ is gone", (dir) => {
    expect(fs.existsSync(path.join(ROOT, dir))).toBe(false);
  });
});
