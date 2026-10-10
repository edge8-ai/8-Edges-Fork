// ME-06 — the retreats entity's shape, asserted against the manifest and the tree.
//
// A move ticket has no new behaviour to test, so what is worth pinning is the
// shape the move is supposed to produce: the entity owns the tables the manifest
// gives it, no old lib/ or components/ path exists (ME-13 deleted the shims),
// every retreat route in app/ is a thin delegation, segment config stays
// in the app file
// (Next reads `dynamic`/`runtime` only from the route file's own `export const`
// declarations, never through a re-export — see checkExports in
// next/dist/build/analysis/get-page-static-info.js), the passport clean-up cron
// keeps its path, and the entity reaches company-os only through that entity's
// index.
//
// Collected by the root vitest.config.ts (`entities/**/*.test.ts`).
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Importing the entity index loads events-server, which builds the service-role
// Supabase client at module load. On CI's Node 20 that client's realtime layer
// needs a WebSocket polyfill and throws; this test only inspects the export
// surface, so the client is stubbed out entirely. Both the kernel path and its
// lib/ shim resolve to the same module id, so one mock covers every importer.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));
// The company-os door this index re-exports from now carries the board actions
// (ME-11), whose access guard wraps its session reader in React's `cache` — an
// export only the canary React that Next ships has. Replaced with identity here.
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
import * as retreatsIndex from "./index";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENTITY = "entities/retreats";

type Manifest = {
  entities: Record<string, { target: string; tables: string[] }>;
};
const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const retreats = manifest.entities.retreats;

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

/** Every source file the entity itself holds. */
function entityFiles(): string[] {
  return filesUnder(ENTITY).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}

// The file names the App Router treats as a route, and the segment-config
// exports it reads by static analysis. Everything else in a route folder is
// ordinary code that moves into the entity wholesale.
const ROUTE_FILE = /\/(page|layout|route|opengraph-image|not-found|error|loading|template|default)\.tsx?$/;
const SEGMENT_CONFIG =
  /^export const (dynamic|dynamicParams|revalidate|fetchCache|runtime|preferredRegion|maxDuration)\b/;
// The delegation names its exports one by one. `export *` looks equivalent and
// is not: Next reads a route file's export names statically, and its
// metadata-route loader turns a star re-export into `export { , runtime }`,
// which fails the build — the opengraph-image routes proved it.
const DELEGATION = new RegExp(`^export \\{ [\\w, ]+ \\} from "@/${ENTITY}/[^"]+";$`);
// A segment's global stylesheets are composition, not logic, and they have to be
// listed here: app/styles is kernel-owned but still under app/, which an entity
// may not import, and the cascade depends on the order they are pulled in.
const STYLESHEET = new RegExp(`^import "@/(app/styles|${ENTITY}/routes)/[^"]+\\.css";$`);
// A page that takes a shell slot (W.169.4; the event P&L's trip cost, RB.12):
// the generated mount imports the body, imports the slot from app/shell.ts,
// and wraps the body in one function that passes the slot as a prop
// (scripts/gen-app-mounts.mjs renderMount). Only that exact generated shape
// counts as composition, and its import of the body is its delegation.
const SLOT_BODY = new RegExp(`^import Body from "@/${ENTITY}/routes/[^"]+";$`);
const SLOT_WRAPPER = [
  /^import type \{ ComponentProps \} from "react";$/,
  SLOT_BODY,
  /^import \{ [\w, ]+ \} from "@\/app\/shell";$/,
  /^export default function Page\(props: Omit<ComponentProps<typeof Body>, "\w+"( \| "\w+")*>\) \{$/,
  /^return <Body \{\.\.\.props\}( \w+=\{\w+\})+ \/>;$/,
  /^\}$/,
];

describe("retreats entity surface", () => {
  it("declares exactly the tables the manifest gives it", async () => {
    const { RETREATS_TABLES } = await import("./tables");
    expect([...RETREATS_TABLES].sort()).toEqual([...retreats.tables].sort());
  });

  it("exports the portable domain surface through its index", async () => {
    for (const name of [
      "eventPath",
      "ticketPath",
      "getEventBySlug",
      "registerForEvent",
      "qrSvg",
      "signedIdUrl",
      "avatarUrlForAuthUser",
    ]) {
      expect(retreatsIndex, `entities/retreats/index.ts does not export ${name}`).toHaveProperty(name);
    }
  });

  it("reaches another entity only through its doors", () => {
    // Design §3 rule 2; the gate in scripts/check-entity-imports.mjs fails any
    // other edge tree-wide, and this repeats it for the entity so a `git mv`
    // that outruns the gate still fails here.
    //
    // Three doors, not two: /upstream is the internal one (ADR 0005). These
    // twelve opengraph-image routes are internal themselves and take the card
    // renderer from entities/site/upstream, which does not sync.
    const offenders = new Set<string>();
    for (const rel of entityFiles()) {
      for (const m of read(rel).matchAll(/from\s+["'](@\/entities\/[^"']+)["']/g)) {
        const spec = m[1];
        if (spec.startsWith(`@/${ENTITY}`)) continue;
        if (/^@\/entities\/[a-z-]+(\/(client|upstream))?$/.test(spec)) continue;
        offenders.add(`${rel} -> ${spec}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });

  it("has no old path left — lib/ and components/ are gone (ME-13)", () => {
    expect(fs.existsSync(path.join(ROOT, "lib"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "components"))).toBe(false);
  });
});

describe("retreats routes under app/", () => {
  // Since ME-13 the manifest lists no app/ paths (app/ is the composition root):
  // the entity's mounts are the app/ files that delegate to one of its routes/,
  // api/ or crons/ bodies, and the directories they sit in are its app/ stems.
  const appStems = [
    "app/my-retreat",
    "app/the-vietnam-experience",
    "app/saigon-private",
    "app/reserve",
    "app/events",
    "app/api/my-retreat",
    // The admin retreat surfaces, moved in with the events tables (RS-11).
    "app/admin/(dashboard)/revenue/events",
    "app/admin/(dashboard)/revenue/public-retreats",
    "app/admin/(dashboard)/revenue/registrations",
    "app/admin/(dashboard)/operations/retreats",
    // The same event pages, served to team members holding the revenue permission.
    "app/team/(dashboard)/revenue/events",
    "app/team/(dashboard)/revenue/public-retreats",
    "app/team/(dashboard)/revenue/registrations",
  ];
  const appFiles = appStems.flatMap((stem) => filesUnder(stem));
  const routeFiles = appFiles.filter((f) => ROUTE_FILE.test(f));
  const mounts = filesUnder("app").filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && new RegExp(`"@/${ENTITY}/(routes|api|crons)/`).test(read(f)),
  );

  it("mounts the entity from exactly those stems, route files included", () => {
    // Guard the guard: an empty scan would make every assertion below vacuous,
    // and a mount outside the stems would be a route the list below never checks.
    expect(routeFiles.length).toBeGreaterThan(20);
    expect(mounts.filter((f) => !appStems.some((stem) => f.startsWith(`${stem}/`)))).toEqual([]);
    expect(mounts.length).toBe(routeFiles.length);
  });

  it("leaves nothing but route files behind — every body moved into the entity", () => {
    expect(appFiles.filter((f) => !ROUTE_FILE.test(f))).toEqual([]);
  });

  it("makes every route file a delegation, with segment config declared locally", () => {
    const wrong = routeFiles.filter((f) =>
      code(f).some(
        (line) => !DELEGATION.test(line) && !SEGMENT_CONFIG.test(line) && !STYLESHEET.test(line) && !SLOT_WRAPPER.some((re) => re.test(line)),
      ),
    );
    expect(wrong).toEqual([]);
    for (const f of routeFiles) {
      expect(code(f).some((line) => DELEGATION.test(line) || SLOT_BODY.test(line)), `${f} delegates to nothing`).toBe(true);
    }
  });

  it("never hides segment config behind the door, where Next cannot read it", () => {
    const hidden = entityFiles().filter((f) => code(f).some((line) => SEGMENT_CONFIG.test(line)));
    expect(hidden).toEqual([]);
  });

});
