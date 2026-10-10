import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural guard for the portal entity (ME-09, docs/engineering/2026-09-03-multi-entity-design.md).
//
// The client portal, the proposals index, the public survey runner, the
// contractor work-token pages and the /t ticket lookup are one product block.
// Its acceptance criteria are structural — the pages render the same HTML
// either way — so they are asserted here rather than left to review, in the
// same shape entities/site/site-entity.test.ts uses:
//
//   1. the entity has the index.ts / tables.ts surface every entity gets (design §2);
//   2. tables.ts agrees with entities.manifest.json, which the ownership ratchet reads;
//   3. the guard stays in the kernel: every gated module reaches requirePortalMember
//      by its kernel/identity path and the entity never grows a copy of it (design
//      §1, "kernel/identity");
//   4. nothing in the entity imports route code from app/ (design §3 rule 3, also an
//      ESLint zone — repeated here so a `git mv` that outruns lint still fails);
//   5. every app/ file that mounts the portal is a thin re-export of the entity,
//      carrying only Next route-segment config and the stylesheet order (design §2:
//      "app/ thin: each file is `export { default } from '@/entities/x/routes/y'`");
//   6. no old lib/ or components/ path exists (ME-13 deleted the shims), and the
//      entity reaches another entity only through its doors.

const ROOT = path.resolve(__dirname, "..", "..");
const ENTITY = path.join(ROOT, "entities", "portal");

type Manifest = {
  entities: Record<string, { tables?: string[] }>;
};

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const portal = manifest.entities.portal;

/** Every file under `dir`, repo-relative, depth-first. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [path.relative(ROOT, dir)];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => filesUnder(path.join(dir, e.name)));
}

/** Repo-relative paths of the entity's .ts/.tsx sources, tests excluded. */
function entitySources(): string[] {
  return filesUnder(ENTITY).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
}

/** Module specifiers named by `import ... from "x"`, `export ... from "x"` or `import "x"`. */
function moduleSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

/** Source with comments blanked out, so a sentence about a guard is not a dependency. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("portal entity surface", () => {
  it("has an index and a tables declaration", () => {
    expect(fs.existsSync(path.join(ENTITY, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ENTITY, "tables.ts"))).toBe(true);
  });

  it("declares exactly the tables the manifest gives it", async () => {
    const { PORTAL_TABLES } = await import("./tables");
    expect([...PORTAL_TABLES].sort()).toEqual([...(portal.tables ?? [])].sort());
  });
});

describe("the portal guard stays in the kernel", () => {
  // ME-09 moved the portal's routes and data modules, not its identity. The
  // guard is kernel/identity's (design §1) and, since ME-13 deleted the old
  // lib/portal-auth shim, the entity reaches it by the kernel path alone.
  it("never declares a guard of its own", () => {
    const offenders = entitySources().filter((f) =>
      /\b(?:export\s+)?(?:async\s+)?function\s+requirePortalMember\b/.test(withoutComments(read(f))),
    );
    expect(offenders).toEqual([]);
  });

  it("takes requirePortalMember only from the kernel path", () => {
    const offenders: string[] = [];
    for (const f of entitySources()) {
      const source = withoutComments(read(f));
      if (!/\brequirePortalMember\b/.test(source)) continue;
      const from = moduleSpecifiers(source).filter((s) => /portal-auth/.test(s));
      if (from.length !== 1 || from[0] !== "@/kernel/identity/portal-auth") offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe("portal entity boundaries", () => {
  it("imports no route code from app/", () => {
    const offenders = entitySources().filter((f) =>
      moduleSpecifiers(read(f)).some((s) => s.startsWith("@/app/") || s === "@/app"),
    );
    expect(offenders).toEqual([]);
  });

  it("reaches another entity only through its doors, and no old lib/ or components/ path", () => {
    // Design §3 rule 2, repeated here so a `git mv` that outruns lint still fails.
    const offenders = new Set<string>();
    for (const f of entitySources()) {
      for (const s of moduleSpecifiers(read(f))) {
        if (!s.startsWith("@/")) continue;
        if (s.startsWith("@/entities/portal") || s.startsWith("@/kernel")) continue;
        if (/^@\/entities\/[a-z-]+(\/client)?$/.test(s)) continue;
        offenders.add(`${f} -> ${s}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });
});

describe("app/ mounts the portal entity without holding its code", () => {
  // Since ME-13 the manifest lists no app/ paths (app/ is the composition root),
  // so the mounts are found by what they import: any app/ file that names one of
  // the portal's routes/, api/ or crons/ bodies mounts it.
  const mountFiles = filesUnder(path.join(ROOT, "app"))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$|__tests__/.test(f))
    .filter((f) => moduleSpecifiers(read(f)).some((s) => /^@\/entities\/portal\/(routes|api|crons)\//.test(s)))
    .sort();

  it("finds the portal's app/ files", () => {
    expect(mountFiles.length).toBeGreaterThan(35);
  });

  it.each(mountFiles)("%s only re-exports the entity", (rel) => {
    const source = read(rel);
    const foreign = moduleSpecifiers(source).filter(
      (s) =>
        !s.startsWith("@/entities/portal") &&
        // Stylesheets stay in app/: nothing outside app/ imports CSS in this repo,
        // and the cascade order of a route sheet against app/styles/* and
        // app/admin/admin.css is part of the rendered page.
        !s.endsWith(".css"),
    );
    expect(foreign, `${rel} still imports non-entity code`).toEqual([]);
    expect(/<[A-Za-z]/.test(source), `${rel} still holds JSX`).toBe(false);
  });
});

describe("no old path exists", () => {
  // ME-13 deleted every lib/ and components/ shim; callers import the entity's
  // doors or, inside the entity, the concrete file.
  it.each(["lib", "components"])("%s/ is gone", (dir) => {
    expect(fs.existsSync(path.join(ROOT, dir))).toBe(false);
  });
});
