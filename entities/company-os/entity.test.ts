// ME-12 — the company-os entity's shape, asserted against the manifest and the tree.
//
// A move ticket has no new behaviour to test, so what is worth pinning is the
// shape the move is supposed to produce: the entity owns the tables the manifest
// gives it, the four AR modules (crm, hiring, boards, campaigns) each have a
// door and never reach into each other, no old lib/ or components/ path exists
// and the entity reaches other entities only through their doors (ME-13), every
// admin route in app/ is a thin delegation with its segment
// config declared locally (Next reads `dynamic`/`runtime` only from the route
// file's own `export const` declarations, never through a re-export — see
// checkExports in next/dist/build/analysis/get-page-static-info.js), the eight
// company-os crons keep their published paths, and the index still exports
// everything team, portal, retreats and site take from it.
//
// Collected by the root vitest.config.ts (`entities/**/*.test.ts`).
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Importing the entity index loads modules that build the service-role Supabase
// client at module load. On CI's Node 20 that client's realtime layer needs a
// WebSocket polyfill and throws; this test only inspects the export surface, so
// the client is stubbed out entirely.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
// The kernel auth guards wrap their session readers in React's `cache`, which
// only the canary React that Next ships has; the React vitest resolves has no
// such export, so the wrapper is replaced with identity for this test.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

// Imported at the top rather than inside the test. The barrel pulls the whole
// door graph behind it, and a dynamic import inside an `it` charges that
// transform to the test's own clock — which is how entities/team's copy of this
// test came to fail at 5276ms on 2026-09-22, on parallel load alone, during a
// push whose diff went nowhere near it. At the top the graph is paid once during
// file collection, which no test timeout governs, and the assertion measures 0ms.
// vitest hoists `vi.mock` above every import, so the mocks above still apply.
import * as companyOsIndex from "./index";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTITY = "entities/company-os";
// RS-04 moved the last module, crm, out to its own entity. company-os declares
// no modules now, and the two tests below hold that line: a module reappearing
// here means a feature was filed under the entity that renders it rather than
// the one that owns its tables.
const MODULES: string[] = [];
const CRONS = [
  "qbo-refresh",
  "qbo-invoice-sync",
  "contractor-payments",
  "broadcast-summary",
  "check-in-reminder",
  "daily-check-in",
  "routine-reaper",
  "automation-watchdog",
  "notification-flush",
];

type Manifest = {
  entities: Record<string, { target: string; modules?: string[]; tables: string[] }>;
};
const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const companyOs = manifest.entities["company-os"];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Source lines that are neither blank nor a `//` comment. */
function code(rel: string): string[] {
  return read(rel)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"));
}

/** Every file under `rel`, as repo-relative paths, sorted. */
function filesUnder(rel: string): string[] {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs
    .readdirSync(abs)
    .flatMap((name) => filesUnder(`${rel}/${name}`))
    .sort();
}

// The file names the App Router treats as a route, and the segment-config
// exports it reads by static analysis. Everything else in a route folder is
// ordinary code that moves into the entity wholesale.
const ROUTE_FILE = /\/(page|layout|route|opengraph-image|not-found|error|loading|template|default)\.tsx?$/;
const SEGMENT_CONFIG =
  /^export const (dynamic|dynamicParams|revalidate|fetchCache|runtime|preferredRegion|maxDuration)\b/;
// The delegation names its exports one by one; see the team entity test for
// why `export *` is not equivalent.
const DELEGATION = new RegExp(`^export \\{ [\\w, ]+ \\} from "@/${ENTITY}/[^"]+";$`);
// A surface's app/ stems may host mounts from more than one entity: FS-03 put
// the Time Off entity's pages under app/admin and app/team, because the entity
// that owns a table owns every screen that writes it, whichever surface renders
// it. A route file here must still delegate to *some* entity.
const ANY_DELEGATION = /^export \{ [\w, ]+ \} from "@\/entities\/[^"]+";$/;
// A segment's global stylesheets are composition, not logic, and they have to be
// listed here: admin.css and app/styles are under app/, which an entity may not
// import, and the cascade depends on the order they are pulled in.
const STYLESHEET = /^import "@\/app\/[^"]+\.css";$/;
// An error boundary must carry the directive in the file under app/ itself.
const USE_CLIENT = /^"use client";$/;
// A page that takes a shell slot (W.169.4; the event P&L's trip cost, RB.12):
// the generated mount imports the body, imports the slot from app/shell.ts,
// and wraps the body in one function that passes the slot as a prop
// (scripts/gen-app-mounts.mjs renderMount). Only that exact generated shape
// counts as composition, and its import of the body is its delegation.
const SLOT_BODY = /^import Body from "@\/entities\/[^"]+";$/;
const SLOT_WRAPPER = [
  /^import type \{ ComponentProps \} from "react";$/,
  SLOT_BODY,
  /^import \{ [\w, ]+ \} from "@\/app\/shell";$/,
  /^export default function Page\(props: Omit<ComponentProps<typeof Body>, "\w+"( \| "\w+")*>\) \{$/,
  /^return <Body \{\.\.\.props\}( \w+=\{\w+\})+ \/>;$/,
  /^\}$/,
];
const delegates = (line: string) => ANY_DELEGATION.test(line) || SLOT_BODY.test(line);

describe("company-os entity surface", () => {
  it("declares exactly the tables the manifest gives it", async () => {
    const { COMPANY_OS_TABLES } = await import("./tables");
    expect([...COMPANY_OS_TABLES].sort()).toEqual([...companyOs.tables].sort());
  });

  it("holds the AR modules the manifest names, each behind its own index", () => {
    expect(companyOs.modules ?? []).toEqual(MODULES);
    expect(fs.existsSync(path.join(ROOT, ENTITY, "modules"))).toBe(false);
    for (const m of MODULES) {
      expect(fs.existsSync(path.join(ROOT, ENTITY, "modules", m, "index.ts")), `${m} has no index`).toBe(true);
    }
  });

  it("lets sibling modules see each other only through their index", () => {
    // The generated ESLint zones enforce this too; repeated here so a `git mv`
    // that outruns lint still fails.
    for (const m of MODULES) {
      const offenders = filesUnder(`${ENTITY}/modules/${m}`)
        .filter((f) => /\.tsx?$/.test(f))
        .filter((f) =>
          MODULES.filter((s) => s !== m).some((s) =>
            new RegExp(`from\\s+"@/${ENTITY}/modules/${s}/`).test(read(f)),
          ),
        );
      expect(offenders, `${m} imports a sibling module's internals`).toEqual([]);
    }
  });

  it("still exports what team, portal, retreats and site take from its index", async () => {
    // The door existed before the move (ME-06); every name below has a caller
    // in another entity, and a move that dropped one would only fail at build.
    // The CRM half of this list moved to entities/crm with RS-04, the event
    // agenda to entities/retreats with RS-11, and the survey engine, org chart
    // and company goals to entities/org with RS-09; each is asserted there.
    // What stays is what company-os itself still owns.
    for (const name of [
      "WORK_REQUEST_STATUS_LABEL",
      "invoiceCompanyForHours",
      "listEntity",
      "ClientCards",
      "loadAgentManagement",
    ]) {
      expect(companyOsIndex, `${ENTITY}/index.ts does not export ${name}`).toHaveProperty(name);
    }
  });

  it("has no old path left — lib/ and components/ are gone (ME-13)", () => {
    expect(fs.existsSync(path.join(ROOT, "lib"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "components"))).toBe(false);
  });

  it("reaches another entity only through its doors", () => {
    // Design §3 rule 2, repeated here so a `git mv` that outruns lint still fails.
    const offenders = new Set<string>();
    for (const f of filesUnder(ENTITY)) {
      if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
      for (const m of read(f).matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(`@/${ENTITY}`) || spec.startsWith("@/kernel/") || spec.startsWith("@/app/")) continue;
        if (/^@\/entities\/[a-z-]+(\/client)?$/.test(spec)) continue;
        if (!spec.startsWith("@/entities/")) continue; // root files such as vercel.json have no owner
        offenders.add(`${f} -> ${spec}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("is never imported by value from a client component anywhere in the tree", () => {
    // entities/company-os/index.ts pulls the service-role client, so a
    // "use client" file that imported a value from it would drag the server
    // side into the browser bundle. Client code enters through
    // entities/company-os/client.ts, the browser-safe door (ME-13), never the barrel.
    const tree = ["app", "entities", "kernel"].flatMap((d) => filesUnder(d));
    const offenders = tree.filter((rel) => {
      if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel)) return false;
      const src = read(rel);
      if (!/^"use client";/m.test(src)) return false;
      return /import\s+(?!type\b)\{[^}]*\}\s+from\s+"@\/entities\/company-os"/.test(
        src.replace(/import\s+\{\s*(type\s+\w+\s*,\s*)*type\s+\w+\s*,?\s*\}\s+from\s+"@\/entities\/company-os";/g, ""),
      );
    });
    expect(offenders).toEqual([]);
  });
});

// The one app/ file that is not a mount: the Admin surface's shell is the
// kernel's and its navigation is generated from this deployment's entity list
// (ADR 0002, RS-14), so app/ is the only place both can be named.
const SHELL_LAYOUT = "app/admin/(dashboard)/layout.tsx";

describe("company-os routes under app/", () => {
  // Since ME-13 the manifest lists no app/ paths (app/ is the composition root):
  // the entity's mounts are the app/ files that delegate to one of its routes/,
  // api/ or crons/ bodies, and the directories they sit in are its app/ stems.
  // On demand, not in vercel.json: the writer agent's step route is called by the
  // app itself as a run hands itself on, so it is a cron-shaped mount with no schedule.
  const ON_DEMAND_CRONS = ["writer-agent", "letter-agent"];
  const appStems = [
    "app/admin",
    "app/api/admin",
    "app/api/qbo",
    "app/api/webhooks",
    // The commerce pages, served again to team members holding the revenue permission.
    "app/team/(dashboard)/revenue/aio-pad",
    "app/team/(dashboard)/revenue/invoices",
    "app/team/(dashboard)/revenue/orders",
    "app/team/(dashboard)/revenue/products",
    ...[...CRONS, ...ON_DEMAND_CRONS].map((c) => `app/api/cron/${c}`),
  ];
  const appFiles = appStems.flatMap((stem) => filesUnder(stem)).filter((f) => !f.endsWith(".css"));
  const routeFiles = appFiles.filter((f) => ROUTE_FILE.test(f));
  const mounts = filesUnder("app").filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && new RegExp(`"@/${ENTITY}/(routes|api|crons)/`).test(read(f)),
  );

  it("mounts the entity from exactly those stems, route files included", () => {
    // Guard the guard: an empty scan would make every assertion below vacuous,
    // and a mount outside the stems would be a route the list below never checks.
    expect(routeFiles.length).toBeGreaterThan(100);
    expect(mounts.filter((f) => !appStems.some((stem) => f.startsWith(`${stem}/`)))).toEqual([]);
    // This entity's mounts are a subset of the surface's route files; the rest
    // belong to another entity contributing pages to the same surface.
    expect(mounts.filter((f) => !routeFiles.includes(f))).toEqual([]);
    // Every route file delegates, except the one that cannot: the dashboard
    // layout is the Admin surface's composition root since RS-14 (it names the
    // kernel shell and the generated nav, which no entity may).
    expect(
      routeFiles.filter((f) => f !== SHELL_LAYOUT && !code(f).some(delegates)),
    ).toEqual([]);
  });

  it("leaves nothing but route files (and admin.css) behind — every body moved into the entity", () => {
    expect(appFiles.filter((f) => !ROUTE_FILE.test(f))).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, "app/admin/admin.css"))).toBe(true);
  });

  it("makes every route file a delegation, with segment config declared locally", () => {
    const wrong = routeFiles.filter((f) => f !== SHELL_LAYOUT).filter((f) =>
      code(f).some(
        (line) =>
          !ANY_DELEGATION.test(line) &&
          !SEGMENT_CONFIG.test(line) &&
          !STYLESHEET.test(line) &&
          !USE_CLIENT.test(line) &&
          !SLOT_WRAPPER.some((re) => re.test(line)),
      ),
    );
    expect(wrong).toEqual([]);
    for (const f of routeFiles) {
      if (f === SHELL_LAYOUT) continue;
      expect(code(f).some(delegates), `${f} delegates to nothing`).toBe(true);
    }
    // No segment config survives in the entity, where Next would never read it.
    const leaked = filesUnder(`${ENTITY}/routes`)
      .concat(filesUnder(`${ENTITY}/api`), filesUnder(`${ENTITY}/crons`))
      .filter((f) => /\.tsx?$/.test(f) && code(f).some((line) => SEGMENT_CONFIG.test(line)));
    expect(leaked).toEqual([]);
  });

  it("keeps the admin stylesheet cascade in the two layouts", () => {
    // The auth layout is still a mount and leads with its stylesheets. The
    // dashboard layout became the surface's composition root with RS-14 — it
    // names the kernel shell and the generated nav, which no mount may do — so
    // its stylesheets sit at the end of its import block instead.
    expect(code("app/admin/(auth)/layout.tsx").slice(0, 2)).toEqual([
      'import "@/app/admin/admin.css";',
      'import "@/app/styles/utilities.css";',
    ]);
    const dashboard = code("app/admin/(dashboard)/layout.tsx");
    expect(dashboard).toContain('import "@/app/admin/admin.css";');
    expect(dashboard).toContain('import "@/app/styles/utilities.css";');
  });

  it("keeps the company-os crons on their published paths", () => {
    const vercel: { crons: Array<{ path: string; schedule: string }> } = JSON.parse(
      read("vercel.json"),
    );
    for (const c of CRONS) {
      const cron = vercel.crons.find((x) => x.path === `/api/cron/${c}/`);
      expect(cron, `${c} is not in vercel.json`).toBeDefined();
      expect(code(`app/api/cron/${c}/route.ts`)).toContain(
        `export { GET } from "@/${ENTITY}/crons/${c}";`,
      );
    }
  });
});
