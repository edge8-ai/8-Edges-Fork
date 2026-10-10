import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDeployments, closureOf, loadDeployments } from "./check-deployment.mjs";
import {
  generate,
  renderEvents,
  renderSearch,
  routeOf,
  searchContributingEntities,
  subscribingEntities,
  unmountedRoutes,
} from "./gen-deployment.mjs";

// A deployment file is the only thing that differs between one client's build
// and another's, so the rules it has to obey are worth pinning: it names real
// entities, it is closed under `requires`, and what the generator emits from it
// changes when the list changes. That last one is the point of the whole thing —
// a test that only ever saw the full deployment would not prove anything is
// pluggable.

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(entities, deployments, doors = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-"));
  temps.push(root);
  const manifest = {
    kernel: { target: "kernel", current: ["kernel"], tables: [] },
    entities: Object.fromEntries(
      Object.entries(entities).map(([n, e]) => [
        n,
        { target: `entities/${n}`, current: [`entities/${n}`], tables: [], portability: "portable", requires: [], ...e },
      ]),
    ),
  };
  fs.writeFileSync(path.join(root, "entities.manifest.json"), JSON.stringify(manifest, null, 2));
  fs.mkdirSync(path.join(root, "deployments"));
  for (const [name, list] of Object.entries(deployments)) {
    fs.writeFileSync(path.join(root, "deployments", `${name}.json`), JSON.stringify({ name, entities: list }, null, 2));
  }
  for (const [name, body] of Object.entries(doors)) {
    fs.mkdirSync(path.join(root, "entities", name), { recursive: true });
    fs.writeFileSync(path.join(root, "entities", name, "index.ts"), body);
  }
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  return { root, manifest };
}

describe("check-deployment", () => {
  it("passes a deployment that lists everything it needs", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: { requires: ["b"] }, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a", "b"] },
    );
    expect(checkDeployments(root, manifest).problems).toEqual([]);
  });

  it("names the entity to add when a requirement is missing", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: { requires: ["b"] }, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
    );
    const { problems } = checkDeployments(root, manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/includes a but not b, which it requires — add "b"/);
  });

  it("rejects an entity that is not in the catalogue", () => {
    const { root, manifest } = fixture({ contacts: {}, a: {} }, { edge8: ["contacts", "a"], small: ["ghost"] });
    expect(checkDeployments(root, manifest).problems.some((p) => /"ghost" is not an entity/.test(p))).toBe(true);
  });

  it("fails when edge8 omits something the catalogue has, so nothing goes unbuilt", () => {
    const { root, manifest } = fixture({ contacts: {}, a: {}, b: {} }, { edge8: ["contacts", "a"] });
    expect(checkDeployments(root, manifest).problems.some((p) => /catalogue has b but this deployment omits it/.test(p))).toBe(true);
  });

  it("treats the mandatory set as installed without being listed", () => {
    const { root, manifest } = fixture({ contacts: {}, a: { requires: ["contacts"] } }, { edge8: ["contacts", "a"], small: ["a"] });
    expect(checkDeployments(root, manifest).problems).toEqual([]);
  });

  it("closes over a chain, not just direct requirements", () => {
    const { manifest } = fixture({ contacts: {}, a: { requires: ["b"] }, b: { requires: ["c"] }, c: {} }, { edge8: [] });
    expect([...closureOf(manifest, ["a"])].sort()).toEqual(["a", "b", "c", "contacts"]);
  });
});

describe("gen-deployment", () => {
  const WITH = 'export { subscriptions } from "./lib/subs";\n';
  const WITHOUT = "export const x = 1;\n";

  it("registers only the subscribing entities a deployment installs", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
      { a: WITH, b: WITH, contacts: WITHOUT },
    );
    expect(subscribingEntities(root, manifest, new Set(["contacts", "a", "b"]))).toEqual(["a", "b"]);
    expect(subscribingEntities(root, manifest, new Set(["contacts", "a"]))).toEqual(["a"]);
  });

  it("emits a registry that differs between deployments, which is the whole point", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: {} },
      { edge8: ["contacts", "a", "b"], small: ["a"] },
      { a: WITH, b: WITH, contacts: WITHOUT },
    );
    const full = generate(root, "edge8", manifest)["app/events.ts"];
    const small = generate(root, "small", manifest)["app/events.ts"];
    expect(full).toContain("aSubscriptions();");
    expect(full).toContain("bSubscriptions();");
    expect(small).toContain("aSubscriptions();");
    expect(small).not.toContain("bSubscriptions();");
  });

  // W.163: HTT, an internal entity, subscribes. app/events.ts ships to the
  // fork, which does not receive HTT, so the fork gets its own registry from
  // the overlay, generated without the internal entities and otherwise the same.
  it("generates the fork's registry without the internal entities", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: { portability: "internal" } },
      { edge8: ["contacts", "a", "b"] },
      { a: WITH, b: WITH, contacts: WITHOUT },
    );
    fs.mkdirSync(path.join(root, ".github/fork-overlay"), { recursive: true });
    const files = generate(root, "edge8", manifest);
    const fork = files[".github/fork-overlay/app/events.ts"];
    expect(files["app/events.ts"]).toContain("bSubscriptions();");
    expect(fork).toContain("aSubscriptions();");
    expect(fork).not.toContain("@/entities/b");
    // Byte for byte what the generator writes in a tree with no internal entity.
    expect(fork).toBe(renderEvents(["a"], "edge8"));
  });

  // The fork has no .github/ and regenerates in its own tree (B.32), so it must
  // not be asked for an overlay copy it can never hold.
  it("asks for the fork's registry only where an overlay exists", () => {
    const { root, manifest } = fixture({ contacts: {}, a: {} }, { edge8: ["contacts", "a"] }, { a: WITH });
    expect(Object.keys(generate(root, "edge8", manifest))).not.toContain(".github/fork-overlay/app/events.ts");
  });

  it("says so plainly when a deployment installs no subscriber at all", () => {
    expect(renderEvents([], "minimal")).toContain("This deployment installs no entity with subscriptions.");
    expect(renderEvents([], "minimal")).toContain("// Nothing to register.");
  });

  it("camel-cases a hyphenated entity into a legal identifier", () => {
    expect(renderEvents(["client-programs"], "edge8")).toContain("clientProgramsSubscriptions");
  });

  it("composes the search of only the entities that export searchContributions from their server door", () => {
    const { root, manifest } = fixture(
      { contacts: {}, a: {}, b: {} },
      { edge8: ["contacts", "a", "b"] },
      { a: 'export { searchContributions } from "./lib/search";\n', b: WITH, contacts: WITHOUT },
    );
    expect(searchContributingEntities(root, manifest, new Set(["contacts", "a", "b"]))).toEqual(["a"]);
  });

  it("guards each surface's search action inline, as its first statement (ADR 0007)", () => {
    const out = renderSearch(["client-programs"], "edge8");
    expect(out.startsWith('"use server";')).toBe(true);
    expect(out).toContain('import { searchContributions as clientProgramsSearch } from "@/entities/client-programs";');
    // The surface's permission is the first statement (ADR 0013, AC.15).
    expect(out).toMatch(/export async function searchAdmin\(query: unknown\): Promise<SearchResult> \{\n  const access = await requirePermission\("surface\.admin"\);/);
    expect(out).toMatch(/export async function searchTeam\(query: unknown\): Promise<SearchResult> \{\n  const access = await requirePermission\("surface\.team"\);/);
  });

  it("still emits working actions when a deployment installs no searcher", () => {
    const out = renderSearch([], "minimal");
    expect(out).toContain("This deployment installs no entity that contributes to search.");
    expect(out).toContain("const CONTRIBUTIONS: SearchContribution[] = [\n  // Nothing to search.\n];");
  });

  it("refuses a deployment name that has no file", () => {
    const { root, manifest } = fixture({ contacts: {} }, { edge8: ["contacts"] });
    expect(() => generate(root, "nope", manifest)).toThrow(/no deployments\/nope\.json/);
  });
});

// B.32: an installed entity can leave a pocket out, and the nav must not link to
// it. The manifest says which routes are internal; the tree says whether they
// were left out, which is the only way the fork's own regeneration agrees.
describe("unmounted routes", () => {
  it("reads a route's URL off its routes/ path, without route groups, and only for pages", () => {
    expect(routeOf("routes/admin/(dashboard)/revenue/aio-pad")).toBe("/admin/revenue/aio-pad");
    expect(routeOf("routes/portal/(dashboard)/programs/[id]/page.tsx")).toBe("/portal/programs/[id]");
    expect(routeOf("routes/portal/(dashboard)/programs/[id]/BriefViewer.tsx")).toBeNull();
    expect(routeOf("crons/survey-reminders.ts")).toBeNull();
    expect(routeOf("api/surveys")).toBeNull();
  });

  it("names an internal route only once the tree no longer has it", () => {
    const pocket = "routes/admin/(dashboard)/revenue/marketing";
    const { root, manifest } = fixture({ contacts: {}, a: { internalPaths: [pocket, "lib/x.ts"] } }, { edge8: ["contacts", "a"] });
    const included = new Set(["contacts", "a"]);
    fs.mkdirSync(path.join(root, "entities/a", pocket), { recursive: true });
    expect(unmountedRoutes(root, manifest, included)).toEqual([]);
    fs.rmSync(path.join(root, "entities/a", pocket), { recursive: true });
    expect(unmountedRoutes(root, manifest, included)).toEqual(["/admin/revenue/marketing"]);
    const nav = generate(root, "edge8", manifest)["app/nav.ts"];
    expect(nav).toMatch(/const ADMIN_NAV_UNMOUNTED: string\[\] = \[\n {2}"\/admin\/revenue\/marketing",\n\];/);
    expect(nav).toContain("withoutRoutes(ADMIN_NAV_CONTRIBUTIONS, ADMIN_NAV_UNMOUNTED)");
    // A route is listed under its own surface only.
    expect(nav).toMatch(/const TEAM_NAV_UNMOUNTED: string\[\] = \[\n {2}\/\/ Every route/);
  });
});

describe("the real deployments", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("ship edge8 and minimal, and both pass", () => {
    const names = loadDeployments(root).map((d) => d.name).sort();
    expect(names).toEqual(["edge8", "minimal"]);
    expect(checkDeployments(root).problems).toEqual([]);
  });

  it("leave something out of minimal, or exclusion is never exercised", () => {
    const [edge8, minimal] = ["edge8", "minimal"].map((n) => loadDeployments(root).find((d) => d.name === n));
    expect(minimal.entities.length).toBeLessThan(edge8.entities.length);
  });

  // The generator finds a subscriber by regex over the door, so a door that
  // switched to `export *` would drop its entity from the registry with no
  // error — and the registry would still "match". Pinning the one real
  // subscriber keeps that from being a silent change.
  // The other three generated artefacts, against the real tree. Each is a place
  // where "leave this entity out" has to mean something: a cron that stops
  // being scheduled, a nav row that stops being rendered, an environment
  // variable that stops being asked for.
  it("schedules only the crons of the entities a deployment installs", () => {
    const full = JSON.parse(generate(root, "edge8")["vercel.json"]).crons;
    const small = JSON.parse(generate(root, "minimal")["vercel.json"]).crons;
    // Every cron belongs to some entity, so the full build has them all.
    expect(full.length).toBeGreaterThan(20);
    expect(small.length).toBeLessThan(full.length);
    const paths = new Set(full.map((c) => c.path));
    expect(small.every((c) => paths.has(c.path))).toBe(true);
    // Coaching is not in minimal, so its cycle is not scheduled there.
    expect(paths.has("/api/cron/coaching-cycle/")).toBe(true);
    expect(small.some((c) => c.path === "/api/cron/coaching-cycle/")).toBe(false);
  });

  // Upstream has every internal pocket, so its sidebar is the whole sidebar.
  // Only the staged fork lacks them (fork-sync.test.mjs proves that side).
  it("leaves no installed route unmounted in this repo", () => {
    const nav = generate(root, "edge8")["app/nav.ts"];
    expect(nav.match(/_UNMOUNTED: string\[\] = \[\n {2}\/\/ Every route/g)).toHaveLength(3);
  });

  it("composes only the navigation of the entities a deployment installs", () => {
    const full = generate(root, "edge8")["app/nav.ts"];
    const small = generate(root, "minimal")["app/nav.ts"];
    expect(full).toContain('import { adminNav as campaignsAdminNav } from "@/entities/campaigns/client";');
    expect(small).not.toContain("campaignsAdminNav");
    expect(small).toContain("boardsAdminNav");
  });

  it("searches only the entities a deployment installs", () => {
    const full = generate(root, "edge8")["app/search.ts"];
    const small = generate(root, "minimal")["app/search.ts"];
    expect(full).toContain("hiringSearch");
    expect(small).not.toContain("hiringSearch");
    expect(small).toContain("boardsSearch");
  });

  it("asks for only the environment the installed entities read", () => {
    const full = generate(root, "edge8")["app/env.ts"];
    const small = generate(root, "minimal")["app/env.ts"];
    // The kernel's Supabase keys are required in every build.
    expect(full).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(small).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(small.length).toBeLessThan(full.length);
  });

  it("mounts only the routes of the entities a deployment installs", async () => {
    const { generateMounts } = await import("./gen-app-mounts.mjs");
    const full = Object.keys(generateMounts(root, "edge8"));
    const small = Object.keys(generateMounts(root, "minimal"));
    // The point of the whole catalogue: a client who bought the Workboard does
    // not compile the marketing site, the retreats or the team workspace.
    expect(full.length).toBeGreaterThan(300);
    expect(small.length).toBeLessThan(full.length / 2);
    expect(small.every((p) => full.includes(p))).toBe(true);
    expect(small.some((p) => p.startsWith("app/admin/(dashboard)/edges/workboard"))).toBe(true);
    expect(small.some((p) => p.startsWith("app/team/"))).toBe(false);
    expect(small.some((p) => p.startsWith("app/admin/(dashboard)/revenue/marketing"))).toBe(false);
  });

  it("registers coaching's subscriptions in the edge8 build, so a done card still closes its commitment", () => {
    const events = generate(root, "edge8")["app/events.ts"];
    expect(events).toContain('import { subscriptions as coachingSubscriptions } from "@/entities/coaching";');
    expect(events).toContain("coachingSubscriptions();");
  });
});

// The registry only runs if Next calls instrumentation.ts. Next 14 did that
// only behind experimental.instrumentationHook; with the flag off the whole bus
// was wired and never started, every gate passed and no subscriber ever
// registered. Since Next 15 (B.18.2) a root instrumentation.ts runs with no
// flag at all, so the pin moved from the flag to the framework version that
// makes it unnecessary: a downgrade below 15 would silently stop the bus again.
describe("the registry actually runs", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

  it("runs on a Next that calls instrumentation.ts without a flag, and names no stale flag", () => {
    const { version } = JSON.parse(fs.readFileSync(path.join(root, "node_modules/next/package.json"), "utf8"));
    expect(Number(version.split(".")[0])).toBeGreaterThanOrEqual(15);
    // Next 15 warns on the removed key; it would also mislead a reader into
    // thinking the flag still matters.
    const config = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(config).not.toMatch(/instrumentationHook/);
    expect(fs.existsSync(path.join(root, "instrumentation.ts"))).toBe(true);
  });

  it("instrumentation.ts registers the generated subscribers, on the Node runtime only", () => {
    const source = fs.readFileSync(path.join(root, "instrumentation.ts"), "utf8");
    expect(source).toMatch(/export async function register\(/);
    expect(source).toContain('import("@/app/events")');
    expect(source).toContain("registerEventSubscribers()");
    // An edge runtime cannot load the Node-only modules in the subscribers'
    // graph. middleware.ts gave this build one until Next 16 moved it to
    // proxy.ts on Node (B.18.3); an edge route added later would again. The import has to sit inside
    // the `if` block — webpack drops a statically-false block, but not code
    // after an early return — so the shape is pinned, not just the check.
    expect(source).toMatch(/if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{\s*const \{ registerEventSubscribers \} = await import\("@\/app\/events"\);/);
  });
});
