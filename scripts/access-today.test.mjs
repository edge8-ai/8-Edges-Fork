import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadManifest } from "./entity-manifest.mjs";
import { chainOf, compareWithToday, gatesIn, isIntended } from "./access-today.mjs";

// Move 2 must change nobody's access. This compares, page by page and persona by
// persona, who passes each signed-in page today (read from the code) with who
// its declaration lets in. The real tree is pinned to an exact list of intended
// differences, each with its reason; anything else is a declaration that would
// change someone's access the day its page is swapped.

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "today-"));
  temps.push(root);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

describe("gatesIn", () => {
  it("reads guard calls and redirecting data gates, and ignores a guard named in a comment", () => {
    const src = `// The (dashboard) group carries the requireTeamMember() gate.
export default async function Page() {
  const actor = await requireTeamMember();
  if (!(await isHiringManager(actor))) redirect("/team");
}`;
    expect(gatesIn(src).sort()).toEqual(["isHiringManager", "requireTeamMember"]);
    expect(gatesIn("// requireAdmin() is not called here\nexport default function P() {}")).toEqual([]);
  });

  it("does not count a data check that hides a section as a page gate", () => {
    expect(gatesIn("const sensitive = await isSuperAdmin(email);\nif (sensitive) show();")).toEqual([]);
  });
});

describe("chainOf", () => {
  it("runs from the app/ surface layout through every entity layout above the page to the page", () => {
    const root = tree({
      "app/admin/(dashboard)/layout.tsx": "requireAdmin();",
      "entities/hiring/routes/admin/(dashboard)/talent/jobs/layout.tsx": "requireSuperAdmin();",
      "entities/hiring/routes/admin/(dashboard)/talent/jobs/page.tsx": "export default function P() {}",
    });
    const chain = chainOf(root, "entities/hiring", "routes/admin/(dashboard)/talent/jobs/page").map((f) => path.relative(root, f));
    expect(chain).toEqual([
      "app/admin/(dashboard)/layout.tsx",
      "entities/hiring/routes/admin/(dashboard)/talent/jobs/layout.tsx",
      "entities/hiring/routes/admin/(dashboard)/talent/jobs/page.tsx",
    ]);
  });

  it("follows a page that re-exports another route's page, but not that page's layouts", () => {
    const root = tree({
      "app/team/(dashboard)/layout.tsx": "requireTeamMember();",
      "entities/campaigns/routes/admin/(dashboard)/layout.tsx": "requireAdmin();",
      "entities/campaigns/routes/admin/(dashboard)/revenue/books/page.tsx": "await requireRevenueAccess();",
      "entities/campaigns/routes/team/(dashboard)/revenue/books/page.tsx":
        'export { default } from "@/entities/campaigns/routes/admin/(dashboard)/revenue/books/page";',
    });
    const chain = chainOf(root, "entities/campaigns", "routes/team/(dashboard)/revenue/books/page").map((f) => path.relative(root, f));
    expect(chain).toContain("entities/campaigns/routes/admin/(dashboard)/revenue/books/page.tsx");
    expect(chain).not.toContain("entities/campaigns/routes/admin/(dashboard)/layout.tsx");
  });
});

describe("the declarations against today", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("reproduce who reaches every signed-in page today, apart from the listed differences", () => {
    const manifest = loadManifest(root);
    const diffs = compareWithToday(root, manifest, new Set(Object.keys(manifest.entities)));
    const unexpected = diffs.filter((d) => !isIntended(d.appPath, d.persona));
    expect(unexpected.map((d) => `${d.appPath} ${d.persona}: today ${d.today}, declared ${d.declared}`)).toEqual([]);
    // Each intended difference only ever refuses sooner; none lets anyone in.
    for (const d of diffs) expect(d.declared).toBe(false);
  });
});

// A swapped page names its permission twice: in its entity's permissions.ts and
// in its requirePermission call. The two must agree, or the guard enforces a
// different rule from the one the registry, the sidebar and the matrix read.
describe("a swapped page's guard", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("asks for exactly the permission its declaration names", async () => {
    const { declarationsOf, signedInRoutes } = await import("./access-declarations.mjs");
    const manifest = loadManifest(root);
    const included = new Set(Object.keys(manifest.entities));
    const atomOf = new Map(
      declarationsOf(root, manifest, included).flatMap((d) => Object.entries(d.routes).map(([k, a]) => [`${d.owner} ${k}`, a])),
    );
    const wrong = [];
    for (const r of signedInRoutes(root, manifest, included)) {
      const src = fs.readFileSync(path.join(root, manifest.entities[r.entity].target, `${r.key}.tsx`), "utf8");
      for (const m of src.matchAll(/require(?:Portal)?Permission\("([^"]+)"/g)) {
        if (m[1] !== atomOf.get(`${r.entity} ${r.key}`)) wrong.push(`${r.appPath}: asks for ${m[1]}, declares ${atomOf.get(`${r.entity} ${r.key}`)}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

// An action names its permission twice as well: in its entity's `actions`
// section and in the requirePermission call that opens it. An export with its
// own `file#export` entry asks for that atom; every other export asks for the
// file's.
describe("a swapped action's guard", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("asks for exactly the permission its declaration names", async () => {
    const { declarationsOf, serverActionFiles } = await import("./access-declarations.mjs");
    const { extractFunctions } = await import("./check-action-auth.mjs");
    const manifest = loadManifest(root);
    const included = new Set(Object.keys(manifest.entities));
    const atomOf = new Map(
      declarationsOf(root, manifest, included).flatMap((d) => Object.entries(d.actions).map(([k, a]) => [`${d.owner} ${k}`, a])),
    );
    const wrong = [];
    for (const a of serverActionFiles(root, manifest, included)) {
      const fileAtom = atomOf.get(`${a.entity} ${a.key}`);
      for (const fn of extractFunctions(fs.readFileSync(path.join(root, a.file), "utf8"))) {
        const want = atomOf.get(`${a.entity} ${a.key}#${fn.name}`) ?? fileAtom;
        for (const m of fn.body.matchAll(/require(?:Portal)?Permission\("([^"]+)"/g)) {
          if (m[1] !== want) wrong.push(`${a.file} ${fn.name}: asks for ${m[1]}, declares ${want ?? "nothing"}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

// The old admin gates decide by who someone is, not by what they hold, so one
// left beside a declared page or action overrules Settings → Access: a role
// granted there opens nothing while the screen says it does, and the pins above
// never see it, because they only read requirePermission calls (AC.23). Every
// gate below the surface's own layout asks for its permission instead. The
// app/ surface layouts stay as the doors into each view, and requireTeamMember
// stays as the call that hands back the team actor once the permission has let
// the person in.
const OLD_GATES = new Set(["requireAdmin", "requireSuperAdmin", "requireRevenueAccess", "requirePortalMember"]);

describe("a declared page or action", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("asks nothing of the old admin gates, in itself or in a layout above it", async () => {
    const { serverActionFiles, signedInRoutes } = await import("./access-declarations.mjs");
    const manifest = loadManifest(root);
    const included = new Set(Object.keys(manifest.entities));
    const files = new Set();
    for (const r of signedInRoutes(root, manifest, included)) {
      for (const f of chainOf(root, manifest.entities[r.entity].target, r.key)) {
        if (!path.relative(root, f).startsWith("app/")) files.add(f);
      }
    }
    for (const a of serverActionFiles(root, manifest, included)) files.add(path.join(root, a.file));
    const old = [...files].flatMap((f) =>
      gatesIn(fs.readFileSync(f, "utf8"))
        .filter((g) => OLD_GATES.has(g))
        .map((g) => `${path.relative(root, f)}: ${g}()`),
    );
    expect(old.sort()).toEqual([]);
  });
});
