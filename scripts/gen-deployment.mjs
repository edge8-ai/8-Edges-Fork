// Emits the parts of the composition root that depend on which entities a
// deployment installs (RS-16, spec §P4). Run `npm run gen:deployment`; with
// `--check` it fails when the committed output is stale, which is how the gate
// keeps a deployment file honest.
//
// It emits two artefacts today. `app/events.ts` is the event-subscriber
// registry: the piece where a missing entity is a *runtime* difference rather
// than a compile error, so generating it is what makes "leave coaching out" a
// one-line change rather than an edit nobody remembers to make. `app/nav.ts`
// is the Admin shell's navigation, composed from the installed entities'
// contributions (ADR 0002) — drop an entity and its rows leave the sidebar with
// it, with no hand-edited array to forget.
//
// It also owns vercel.json's `crons` array: each routine declares its own
// schedule beside itself (`export const schedule`), the mount path stays a
// Vercel fact read off app/api/cron/, and an entity a deployment leaves out
// takes its schedules with it.
//
// And `app/search.ts`: the global search (S.1). Each installed entity that
// exports `searchContributions` from its server door answers a query, and the
// file holds one server action per surface, each guarding inline before it asks
// them (ADR 0007).
//
// And `app/env.ts`: the environment this build actually reads, gathered from the
// installed entities and the kernel. A client hosting this themselves (ADR 0001)
// needs to know what to configure, and the list is only true of the entities
// they install.
//
// And `app/routines.ts`: the handler of every scheduled routine, which Run now
// on Settings -> Agents runs in-process (Y.25).
//
// And `app/permissions.ts`: the access registry (ADR 0013). Each installed entity
// declares its permissions, the signed-in pages and actions that need them and
// the roles its facts imply, in `permissions.ts`; the kernel declares its own
// atoms in kernel/identity/permissions.ts. The registry is emitted as data, so a
// changed declaration makes it stale and an invalid one stops generation.
//
// The rest of the composition root — the app/ mounts — is still hand-written
// and is the next thing to move behind this generator. The shape is deliberately ready for it: a
// deployment name in, files out, one freshness check over all of them.
//
// Which deployment is built comes from EDGE8_DEPLOYMENT, defaulting to edge8.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { loadDeployments, closureOf } from "./check-deployment.mjs";
import { OVERLAY_DIR, ships } from "./check-portability.mjs";
import { declarationsOf, holderGrants, resolveRoles, validateDeclarations } from "./access-declarations.mjs";

export const GENERATED = "app/events.ts";
export const GENERATED_NAV = "app/nav.ts";
export const GENERATED_CRONS = "vercel.json";
export const GENERATED_ENV = "app/env.ts";
export const GENERATED_SHELL = "app/shell.ts";
export const GENERATED_SEARCH = "app/search.ts";
export const GENERATED_PERMISSIONS = "app/permissions.ts";
export const GENERATED_ACCESS = "app/access.ts";
// The automation registry (Y.14, Z.3): every routine's name, description, what
// it reads and the apps it talks to, as each cron declares them beside its
// schedule. Data the kernel holds for Settings -> Agents, as vercel.json is; it
// is JSON so the company-os entity can read it without importing app/.
export const GENERATED_AUTOMATIONS = "kernel/audit/automations.json";
// The fork's copy of app/events.ts (W.163). app/events.ts ships to the fork,
// which does not receive an internal entity, so a registry that imports one
// (HTT answers a card's PR link) would not build there, and check:portability
// refuses it. The fork sync copies .github/fork-overlay/ over the staged tree,
// so the registry the fork gets is generated here without the internal
// entities: byte for byte what this generator writes in a tree that has none,
// which keeps the fork's own check:generated green.
export const GENERATED_FORK_EVENTS = ".github/fork-overlay/app/events.ts";
// The routine handlers Run now starts (Y.25), and the fork's copy of them for
// the same reason as the events: the registry imports internal entities' crons.
export const GENERATED_ROUTINES = "app/routines.ts";
export const GENERATED_FORK_ROUTINES = ".github/fork-overlay/app/routines.ts";

/** The names an internal entity (portability "internal") is left out of. */
export function shippingOnly(names, manifest) {
  return names.filter((n) => manifest.entities[n]?.portability !== "internal");
}

/** Entities that export `subscriptions` from their server door, in install order. */
export function subscribingEntities(root, manifest, included) {
  return [...included]
    .sort()
    .filter((name) => {
      const door = path.join(root, manifest.entities[name].target, "index.ts");
      return fs.existsSync(door) && /export\s*\{[^}]*\bsubscriptions\b/.test(fs.readFileSync(door, "utf8"));
    });
}

export function renderEvents(names, deploymentName) {
  const imports = names
    .map((n) => `import { subscriptions as ${camel(n)}Subscriptions } from "@/entities/${n}";`)
    .join("\n");
  const calls = names.map((n) => `  ${camel(n)}Subscriptions();`).join("\n");
  return `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// The composition root's event registration. \`app/\` is the only place that
// knows which entities a deployment installs, so it is the only place that may
// wire publishers to subscribers: an entity that registered itself on import
// would make registration depend on module load order, and a deployment that
// excluded it would still have to import it to find that out.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { resetSubscribers } from "@/kernel/events";
${imports || "// This deployment installs no entity with subscriptions."}

let registered = false;

/** Idempotent: Next may evaluate a module more than once per process. */
export function registerEventSubscribers(): void {
  if (registered) return;
  registered = true;
  resetSubscribers();
${calls || "  // Nothing to register."}
}
`;
}

/** The three surfaces, and the export each entity contributes to one with. */
export const SURFACES = [
  { binding: "adminNav", constant: "ADMIN_NAV", slots: "ADMIN_SLOTS", ia: "admin-ia", root: "/admin", label: "Admin shell's" },
  { binding: "teamNav", constant: "TEAM_NAV", slots: "TEAM_SLOTS", ia: "team-ia", root: "/team", label: "team hub's" },
  { binding: "portalNav", constant: "PORTAL_NAV", slots: "PORTAL_SLOTS", ia: "portal-ia", root: "/portal", label: "client portal's" },
];

/**
 * The URL pattern an entity's `routes/` path serves, or null when it serves
 * none. `routes/<rest>` is `app/<rest>` (gen-app-mounts.mjs), so the URL is
 * `<rest>` without its route groups; a file names a URL only when it is a page.
 */
export function routeOf(inner) {
  if (!inner.startsWith("routes/")) return null;
  let rest = inner.slice("routes/".length);
  if (/\.[a-z]+$/i.test(rest)) {
    if (!/(^|\/)page\.tsx?$/.test(rest)) return null;
    rest = rest.replace(/\/?page\.tsx?$/, "");
  }
  return `/${rest.split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/")}`;
}

/**
 * The routes an installed entity declares internal and this tree does not
 * have, as URL patterns.
 *
 * Upstream every one of them is present, so the list is empty and the nav is
 * the whole nav. The public fork is staged without them (gen-fork-excludes.mjs
 * reads the same `internalPaths`) and regenerates this file in the staged tree
 * (stage-fork-tree.sh), so there the list names exactly the pockets it lacks and
 * their rows leave the sidebar instead of linking to a 404. The decision is the
 * manifest's; the tree only says whether it has been carried out, which is what
 * keeps the fork's own check:generated agreeing with the file it received.
 */
export function unmountedRoutes(root, manifest, included) {
  const out = new Set();
  for (const name of included) {
    const entity = manifest.entities[name];
    for (const inner of entity.internalPaths ?? []) {
      const url = routeOf(inner);
      if (url && !fs.existsSync(path.join(root, entity.target, inner))) out.add(url);
    }
  }
  return [...out].sort();
}

/** Entities that export `binding` from their browser-safe door, in install order. */
export function navContributingEntities(root, manifest, included, binding = "adminNav") {
  const re = new RegExp(`export\\s*\\{[^}]*\\b${binding}\\b`);
  return [...included]
    .sort()
    .filter((name) => {
      const door = path.join(root, manifest.entities[name].target, "client.ts");
      return fs.existsSync(door) && re.test(fs.readFileSync(door, "utf8"));
    });
}

export function renderNav(bySurface, deploymentName, unmounted = []) {
  const head = `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// Every surface's navigation, composed from the entities this deployment
// installs. \`app/\` is the only place that knows which those are, which is why
// the composition happens here and not in the kernel (which may name no entity)
// or in an entity (which would have to name its peers). Each shell owns its
// information architecture and its slots; each entity owns its rows, and a row
// that depends on who is looking carries a \`when\` capability the shell
// resolves per request.
//
// An installed entity may still leave a pocket out (\`internalPaths\` in
// entities.manifest.json, which the public fork is staged without). Each
// surface's UNMOUNTED list names the routes this tree lacks, and their rows go
// with them, so the sidebar never links to a page the build does not have.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { composeNav, withoutRoutes, type NavContribution, type NavSection } from "@/kernel/shell/nav";
${SURFACES.map((s) => `import { ${s.slots} } from "@/kernel/shell/${s.ia}";`).join("\n")}
`;
  const blocks = SURFACES.map((surface) => {
    const names = bySurface[surface.binding] ?? [];
    const alias = (n) => `${camel(n)}${surface.constant.split("_")[0][0]}${surface.constant.split("_")[0].slice(1).toLowerCase()}Nav`;
    const imports = names
      .map((n) => `import { ${surface.binding} as ${alias(n)} } from "@/entities/${n}/client";`)
      .join("\n");
    const spread = names.map((n) => `  ...${alias(n)},`).join("\n");
    const missing = unmounted
      .filter((u) => u === surface.root || u.startsWith(`${surface.root}/`))
      .map((u) => `  ${JSON.stringify(u)},`)
      .join("\n");
    return `${imports || `// This deployment installs no entity that contributes to the ${surface.label} navigation.`}

const ${surface.constant}_CONTRIBUTIONS: NavContribution[] = [
${spread || "  // Nothing to contribute."}
];

const ${surface.constant}_UNMOUNTED: string[] = [
${missing || "  // Every route the contributions name is mounted."}
];

export const ${surface.constant}: NavSection[] = composeNav(
  ${surface.slots},
  withoutRoutes(${surface.constant}_CONTRIBUTIONS, ${surface.constant}_UNMOUNTED),
);
`;
  });
  return [head, ...blocks].join("\n");
}

/** Entities that export `searchContributions` from their server door, in install order. */
export function searchContributingEntities(root, manifest, included) {
  return [...included]
    .sort()
    .filter((name) => {
      const door = path.join(root, manifest.entities[name].target, "index.ts");
      return fs.existsSync(door) && /export\s*\{[^}]*\bsearchContributions\b/.test(fs.readFileSync(door, "utf8"));
    });
}

export function renderSearch(names, deploymentName) {
  const imports = names
    .map((n) => `import { searchContributions as ${camel(n)}Search } from "@/entities/${n}";`)
    .join("\n");
  const spread = names.map((n) => `  ...${camel(n)}Search,`).join("\n");
  return `"use server";
// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// The global search (S.1). Each installed entity contributes searchers from its
// server door and this file composes the ones this deployment installs, so a
// deployment without an entity simply has no searcher for it, and the kernel's
// palette never names one. Each surface gets its own action. The action guards
// first, inline (ADR 0007), with the permission that enters its surface, then
// hands the guard's answer to every searcher as a SearchActor. runSearch asks a
// contribution only when the person may open the page its hits open, and drops
// any hit whose page they may not open (ADR 0013), so search is never a side
// door; each searcher still scopes its rows the way its own screen does. The
// portal has no action yet: it was left out of v1 on 2026-09-25.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { runSearch, type SearchContribution, type SearchResult } from "@/kernel/shell/search";
${imports || "// This deployment installs no entity that contributes to search."}

const CONTRIBUTIONS: SearchContribution[] = [
${spread || "  // Nothing to search."}
];

// What the browser sends is only ever a typed string; anything else searches for nothing.
const Query = z.string().max(200).catch("");

export async function searchAdmin(query: unknown): Promise<SearchResult> {
  const access = await requirePermission("surface.admin");
  return runSearch(CONTRIBUTIONS, { surface: "admin", admin: access.user, access }, Query.parse(query));
}

export async function searchTeam(query: unknown): Promise<SearchResult> {
  const access = await requirePermission("surface.team");
  // The team searchers scope rows by the team actor (a member's boards), which
  // the permission guard does not carry; everyone holding surface.team has one.
  const team = await requireTeamMember();
  return runSearch(CONTRIBUTIONS, { surface: "team", team, access }, Query.parse(query));
}
`;
}

// What the hand-written shells take from entities, and which entity provides
// each. The three surface layouts and the root layout are the only files under
// app/ a person writes, and they used to import these directly — so a
// deployment that left the assistant out still bundled the chat widget, and one
// without the marketing site still carried its frame (W.7). Each slot names its
// provider and a fallback; the generated module imports the provider only when
// the deployment installs it, and the layouts import the module.
export const SHELL_SLOTS = [
  {
    name: "INBOX_HREF",
    entity: "notifications",
    fallback: "null",
    type: "string | null",
    why: "where the admin sidebar's envelope leads; no envelope when there is no inbox to open",
  },
  {
    // The first slot a PAGE takes rather than a shell (W.169.4): the generated
    // My Week mount passes it to the boards page (boards' mounts.ts, `slots`).
    name: "InboxLine",
    entity: "notifications",
    fallback: "null",
    type: "InboxLineSlot",
    why: "the inbox in one line on My Week; nothing when there is no inbox",
  },
  {
    // The plan's "Profile → Reimbursements" (RB.1): team's profile page shows the
    // member's claims without team naming the entity that owns them.
    name: "ProfileClaimsPanel",
    entity: "reimbursements",
    fallback: "null",
    type: "ProfileClaimsSlot",
    why: "the member's own claims on their profile; nothing when reimbursements is not installed",
  },
  {
    // The plan's "a claim counts toward its trip's cost once paid" (RB.12):
    // retreats' event P&L shows a trip's paid claims without retreats naming
    // the entity that owns them.
    name: "TripCostPanel",
    entity: "reimbursements",
    fallback: "null",
    type: "TripCostSlot",
    why: "a trip's paid reimbursement claims on its event P&L; nothing when reimbursements is not installed",
  },
  {
    name: "AdminAssistant",
    entity: "assistant",
    fallback: "null",
    type: "((props: { email: string | null | undefined }) => ReactElement) | null",
    why: "the admin shell's chat pane; nothing when the assistant is not installed",
  },
  {
    name: "avatarUrlForAuthUser",
    entity: "retreats",
    fallback: "async (_userId: string): Promise<string | null> => null",
    type: "(userId: string) => Promise<string | null>",
    why: "the signed-in admin's avatar; no avatar when retreats (which owns the media) is not installed",
  },
  {
    name: "SiteFrame",
    entity: "site",
    fallback: "({ children }: { children: ReactNode }) => createElement(Fragment, null, children)",
    type: "(props: { children: ReactNode }) => ReactNode",
    why: "the public site's header and footer around every page; a bare frame without the site",
  },
  { name: "SITE_TITLE", entity: "site", fallback: '""', type: "string", why: "head copy from the site entity" },
  { name: "SITE_DESCRIPTION", entity: "site", fallback: '""', type: "string", why: "head copy from the site entity" },
  { name: "SITE_NAME", entity: "site", fallback: '""', type: "string", why: "head copy from the site entity" },
  { name: "LOGO_SRC", entity: "site", fallback: '""', type: "string", why: "schema.org logo from the site entity" },
];

export function renderShell(included, deploymentName) {
  const head = `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// What the hand-written shells under app/ (and, through a mount's \`slots\`, a
// page) take from entities. A shell may not
// import an entity directly: it does not know which entities this deployment
// installs, and an import of one that is not installed still bundles it. Each
// slot below is provided by one entity when that entity is installed and by a
// fallback otherwise, so the same layout files serve every deployment.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { createElement, Fragment, type ReactElement, type ReactNode } from "react";
import type { InboxLineSlot, ProfileClaimsSlot, TripCostSlot } from "@/kernel/shell/page-slots";
`;
  const byEntity = new Map();
  for (const slot of SHELL_SLOTS) {
    if (!included.has(slot.entity)) continue;
    (byEntity.get(slot.entity) ?? byEntity.set(slot.entity, []).get(slot.entity)).push(slot.name);
  }
  const imports = [...byEntity]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entity, names]) => `import { ${names.map((n) => `${n} as ${n}Provided`).join(", ")} } from "@/entities/${entity}";`)
    .join("\n");
  const exports = SHELL_SLOTS.map((slot) => {
    const provided = included.has(slot.entity);
    return `// ${slot.why}.\nexport const ${slot.name}: ${slot.type} = ${provided ? `${slot.name}Provided` : slot.fallback};`;
  }).join("\n\n");
  const unused = imports ? "" : "// This deployment installs none of the entities that contribute to the shells.\n";
  return `${head}${imports ? imports + "\n" : unused}\n${exports}\n`;
}

/**
 * The cron mounts, as {path, entity, schedule}. The URL is a Vercel fact and
 * lives in app/, so it is read off the mount; the schedule is a fact about the
 * routine and lives beside it in the entity.
 */
export function cronMounts(root) {
  const dir = path.join(root, "app/api/cron");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const route = path.join(dir, name, "route.ts");
    if (!fs.existsSync(route)) continue;
    const m = /@\/entities\/([a-z-]+)\/crons\/([A-Za-z0-9_-]+)/.exec(fs.readFileSync(route, "utf8"));
    if (!m) continue;
    const body = path.join(root, "entities", m[1], "crons", `${m[2]}.ts`);
    if (!fs.existsSync(body)) continue;
    const sched = /^export const schedule = "([^"]+)";$/m.exec(fs.readFileSync(body, "utf8"));
    // No schedule means on demand: the writer agent's step route is called by
    // the app itself as a run hands itself on, so it is a cron-shaped mount
    // with no entry in vercel.json.
    if (!sched) continue;
    out.push({ path: `/api/cron/${name}/`, entity: m[1], schedule: sched[1] });
  }
  return out;
}

/**
 * One cron's `export const automation = { ... }` block, read as text. The
 * format is pinned so this needs no TypeScript: bare keys, double-quoted
 * strings, arrays of them, trailing commas allowed. A cron without one, or one
 * this cannot read, throws: the Agents page would otherwise show it as "No
 * metadata yet", which is how eleven crons drifted (Y.44).
 */
export function automationOf(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = /^export const automation = (\{[\s\S]*?\n\});$/m.exec(text);
  if (!m) throw new Error(`${file} declares no \`export const automation = { name, description, content, apps }\` (Y.14).`);
  let parsed;
  try {
    parsed = JSON.parse(m[1].replace(/^(\s*)([A-Za-z]+):/gm, '$1"$2":').replace(/,(\s*[}\]])/g, "$1"));
  } catch (e) {
    throw new Error(`${file}: its automation block is not in the pinned literal format (${e.message}).`);
  }
  const strings = (v) => Array.isArray(v) && v.every((s) => typeof s === "string");
  if (typeof parsed.name !== "string" || typeof parsed.description !== "string" || !strings(parsed.content) || !strings(parsed.apps)) {
    throw new Error(`${file}: automation needs name and description (strings) and content and apps (string arrays).`);
  }
  // `shadow: true` declares that the routine honours shadow mode (Z.17): in a
  // shadow run it records what it would have sent and sends nothing, so
  // Settings -> Agents may offer Shadow on its switch. Only `true` is accepted,
  // and it is written only when set, so a routine that never declares it keeps
  // its entry byte for byte.
  if (parsed.shadow !== undefined && parsed.shadow !== true) {
    throw new Error(`${file}: automation's shadow, when present, must be \`true\`.`);
  }
  return {
    name: parsed.name,
    description: parsed.description,
    content: parsed.content,
    apps: parsed.apps,
    ...(parsed.shadow === true ? { shadow: true } : {}),
  };
}

/** Every cron mount of the deployment, scheduled or on demand, with its automation block. */
export function renderAutomations(root, included) {
  const dir = path.join(root, "app/api/cron");
  const out = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).sort()) {
      const route = path.join(dir, name, "route.ts");
      if (!fs.existsSync(route)) continue;
      const m = /@\/entities\/([a-z-]+)\/crons\/([A-Za-z0-9_-]+)/.exec(fs.readFileSync(route, "utf8"));
      if (!m || !included.has(m[1])) continue;
      const rel = `entities/${m[1]}/crons/${m[2]}.ts`;
      const body = path.join(root, rel);
      if (!fs.existsSync(body)) continue;
      const sched = /^export const schedule = "([^"]+)";$/m.exec(fs.readFileSync(body, "utf8"));
      out.push({ path: `/api/cron/${name}/`, entity: m[1], file: rel, schedule: sched ? sched[1] : null, ...automationOf(body) });
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * The scheduled cron mounts of the installed entities, as {path, entity, body,
 * module}: the routines Run now on Settings -> Agents may start (Y.25). The
 * module is the mount itself, so Run now calls the very GET Vercel Cron calls,
 * and the registry names routes, which app/ owns, rather than an entity's
 * crons. An on-demand mount (no schedule) is left out: it needs a subject,
 * which a bare run cannot give it.
 */
export function scheduledCronModules(root, included) {
  const dir = path.join(root, "app/api/cron");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const route = path.join(dir, name, "route.ts");
    if (!fs.existsSync(route)) continue;
    const m = /@\/entities\/([a-z-]+)\/crons\/([A-Za-z0-9_-]+)/.exec(fs.readFileSync(route, "utf8"));
    if (!m || !included.has(m[1])) continue;
    const body = path.join(root, "entities", m[1], "crons", `${m[2]}.ts`);
    if (!fs.existsSync(body)) continue;
    if (!/^export const schedule = "([^"]+)";$/m.test(fs.readFileSync(body, "utf8"))) continue;
    out.push({ path: `/api/cron/${name}/`, entity: m[1], body: `entities/${m[1]}/crons/${m[2]}.ts`, module: `@/app/api/cron/${name}/route` });
  }
  return out;
}

/**
 * `app/routines.ts`: one lazy loader per scheduled routine, registered with the
 * kernel at boot, so Run now runs a routine's own handler in-process (Y.25).
 * The kernel may import no entity and an entity may import nothing under app/,
 * so the composition root hands the handlers over, as it does the event
 * subscribers.
 */
export function renderRoutines(crons, deploymentName) {
  const lines = crons.map((c) => `    ${JSON.stringify(c.path)}: () => import(${JSON.stringify(c.module)}).then((m) => m.GET),`);
  return `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// Run now on Settings -> Agents (Y.25): the handler of every scheduled routine
// this deployment installs, keyed by its cron path: the GET of its mount, the
// same function Vercel Cron calls. The kernel runs a routine in-process through
// it, never by calling the site's URL, and may import nothing under app/, so
// the composition root registers the handlers at boot, from
// instrumentation.ts. Each loader imports its route only when it is run.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { registerRoutineEntryPoints } from "@/kernel/audit/routine-entry-points";

/** Idempotent: registration replaces what was there. */
export function registerRoutines(): void {
  registerRoutineEntryPoints({
${lines.join("\n") || "    // This deployment installs no scheduled routine."}
  });
}
`;
}

export function renderVercelJson(root, included) {
  const file = path.join(root, "vercel.json");
  // A fixture root without one has no crons to place; the real root always has
  // it, and everything but `crons` is carried through untouched.
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const crons = cronMounts(root)
    .filter((c) => included.has(c.entity))
    .map(({ path: p, schedule }) => ({ path: p, schedule }));
  return `${JSON.stringify({ ...current, crons }, null, 2)}\n`;
}

const SOURCE_FILE = /\.tsx?$/;

function sourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (SOURCE_FILE.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Every environment variable a tree reads, split by whether the code can do
 * without it. `requireEnv("X")` throws when X is unset, so it is required;
 * `optionalEnv("X")` and a bare `process.env.X` both have a defined answer when
 * it is missing, so they are optional. The scan is the declaration: a
 * hand-written list beside the code is one more thing to drift.
 *
 * Code that does not ship is skipped. This file is a product artefact — it is
 * the list a self-hosting client configures — and an internal pocket's
 * variables name Edge8's own business, which the fork content scanner is right
 * to block — the fork content scanner caught a client-named variable here on
 * the first run.
 */
export function envOf(root, dirs, manifest) {
  const required = new Set();
  const optional = new Set();
  for (const dir of dirs) {
    for (const file of sourceFiles(path.join(root, dir))) {
      if (manifest && !ships(path.relative(root, file), manifest)) continue;
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/requireEnv\("([A-Z0-9_]+)"\)/g)) required.add(m[1]);
      for (const m of src.matchAll(/optionalEnv\("([A-Z0-9_]+)"\)/g)) optional.add(m[1]);
      for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)\b/g)) optional.add(m[1]);
      for (const m of src.matchAll(/process\.env\["([A-Z0-9_]+)"\]/g)) optional.add(m[1]);
    }
  }
  for (const name of required) optional.delete(name);
  return { required: [...required].sort(), optional: [...optional].sort() };
}

export function renderEnv(root, manifest, included, deploymentName) {
  const dirs = ["kernel", ...[...included].sort().map((n) => manifest.entities[n].target)];
  const { required, optional } = envOf(root, dirs, manifest);
  const list = (names) => (names.length ? names.map((n) => `  ${JSON.stringify(n)},`).join("\n") : "");
  return `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// The environment this build reads, gathered from the kernel and the entities
// this deployment installs. A client hosting the product themselves needs to
// know what to configure, and the answer depends on which entities they took
// (ADR 0001) — so the list is generated rather than written down once and left
// to drift. Internal code is skipped: its variables are Edge8's own business
// and this file ships.
//
// REQUIRED is what \`requireEnv\` throws without. OPTIONAL is read through
// \`optionalEnv\` or straight off \`process.env\`, where the code has a defined
// answer when it is unset — a feature that stays off rather than a broken boot.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.

export const REQUIRED_ENV = [
${list(required)}
] as const;

/**
 * Read through \`optionalEnv\` or straight off \`process.env\`. Nothing imports
 * it — it is the configuration list a self-hosting client reads, not a runtime
 * value — so knip is told to leave it alone.
 * @generator
 */
export const OPTIONAL_ENV = [
${list(optional)}
] as const;

/** The required variables this process is missing, for a boot-time report. */
export function missingDeploymentEnv(): string[] {
  return REQUIRED_ENV.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === "";
  });
}
`;
}

/** Entities that export `accessContributions` from their server door, in install order. */
export function accessContributingEntities(root, manifest, included) {
  return [...included]
    .sort()
    .filter((name) => {
      const door = path.join(root, manifest.entities[name].target, "index.ts");
      return fs.existsSync(door) && /export\s*\{[^}]*\baccessContributions\b/.test(fs.readFileSync(door, "utf8"));
    });
}

export function renderAccess(names, deploymentName) {
  const imports = names
    .map((n) => `import { accessContributions as ${camel(n)}Access } from "@/entities/${n}";`)
    .join("\n");
  return `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// The access resolver's facts that only an entity can read (ADR 0013): the roles
// a coaching row or a requisition implies, and the ids a coach's team or a
// person's clients reach. The kernel may import no entity, so the composition
// root registers what the installed entities contribute, at boot, from
// instrumentation.ts. A deployment without an entity has none of its facts.
// The same call hands the kernel this deployment's permission registry, which
// it may not import from app/ itself.
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the deployment disagree.
import { registerAccessContributions } from "@/kernel/identity/access-contributions";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { PERMISSIONS } from "@/app/permissions";
${imports || "// This deployment installs no entity that contributes access facts."}

/** Idempotent: registration replaces what was there. */
export function registerAccess(): void {
  registerPermissionRegistry(PERMISSIONS);
  registerAccessContributions([${names.map((n) => `${camel(n)}Access`).join(", ")}]);
}
`;
}

/**
 * The registry's content, from the kernel's and the installed entities'
 * declarations. Throws on an invalid declaration: a registry that granted on a
 * typo, or let one entity name another's atom, would be worse than none.
 */
export function permissionsModel(root, manifest, included) {
  const declarations = declarationsOf(root, manifest, included);
  const entityNames = Object.keys(manifest.entities);
  // Bundles are checked against every declaration in the tree, installed or
  // not: an atom only an uninstalled entity declares leaves a bundle out,
  // while one nobody declares fails the build.
  const catalogue = declarationsOf(root, manifest, entityNames);
  const bundles = resolveRoles({ installed: declarations, catalogue, entityNames });
  const problems = [...validateDeclarations(root, declarations, entityNames), ...bundles.problems];
  if (problems.length > 0) {
    throw new Error(`gen-deployment: the access declarations are invalid:\n  - ${problems.join("\n  - ")}`);
  }
  const model = { atoms: [], routes: [], actions: [], implies: [], roles: bundles.roles, leftOut: bundles.leftOut };
  for (const d of declarations) {
    for (const [key, sentence] of Object.entries(d.permissions)) {
      model.atoms.push({ key, owner: d.owner, sentence, holders: holderGrants(d.holders[key] ?? "") });
    }
    for (const [key, atom] of Object.entries(d.routes)) model.routes.push({ url: routeOf(`${key}.tsx`), atom });
    for (const [key, atom] of Object.entries(d.actions)) model.actions.push({ path: `${d.target}/${key}`, atom });
    for (const [role, because] of Object.entries(d.implies)) model.implies.push({ role, owner: d.owner, because });
  }
  return model;
}

export function renderPermissions(model, deploymentName) {
  const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const q = JSON.stringify;
  const lines = (rows, empty) => (rows.length ? rows.join("\n") : `    // ${empty}`);
  const atoms = [...model.atoms]
    .sort((a, b) => byKey(a.key, b.key))
    .map((a) => `    ${q(a.key)}: { owner: ${q(a.owner)}, sentence: ${q(a.sentence)}, holders: [${a.holders.map((h) => `{ role: ${q(h.role)}, scope: ${q(h.scope)} }`).join(", ")}] },`);
  const routes = [...model.routes].sort((a, b) => byKey(a.url, b.url)).map((r) => `    ${q(r.url)}: ${q(r.atom)},`);
  const actions = [...model.actions].sort((a, b) => byKey(a.path, b.path)).map((r) => `    ${q(r.path)}: ${q(r.atom)},`);
  const roles = new Map();
  for (const i of model.implies) (roles.get(i.role) ?? roles.set(i.role, []).get(i.role)).push(i);
  const implies = [...roles]
    .sort(([a], [b]) => byKey(a, b))
    .map(([role, list]) => `    ${q(role)}: [${list.map((i) => `{ owner: ${q(i.owner)}, because: ${q(i.because)} }`).join(", ")}],`);
  const bundles = [...(model.roles ?? [])]
    .sort((a, b) => byKey(a.key, b.key))
    .map(
      (r) =>
        `    ${q(r.key)}: { owner: ${q(r.owner)}, name: ${q(r.name)}, sentence: ${q(r.sentence)}, locked: ${r.locked}, atoms: [${r.atoms.map((a) => `{ permission: ${q(a.permission)}, scope: ${q(a.scope)} }`).join(", ")}] },`,
    );
  const leftOut = [...(model.leftOut ?? [])]
    .sort((a, b) => byKey(a.key, b.key))
    .map((r) => `    // Left out: ${r.key} (${r.owner}) names ${r.missing.join(", ")}, which this deployment does not install.`);
  return `// GENERATED by scripts/gen-deployment.mjs from deployments/${deploymentName}.json — do not edit.
//
// The access registry (ADR 0013): every permission this deployment's kernel and
// entities declare with the roles that hold it by default (\`npm run
// access:sync\` writes those to the database the first time a pair is seen),
// which signed-in page and server action needs which, which roles a fact
// implies, and the role bundles access:sync seeds the first time it sees one
// (a locked bundle is the kernel's Admin or Super Admin, edited only in code).
// Each entity owns its declaration in its own
// \`permissions.ts\`; this file is where the deployment composes them, so a
// deployment without an entity has none of its permissions. A route is keyed by
// its URL pattern, an action by its file (and \`#export\` where one export of
// the file needs a different permission from the rest).
//
// Regenerate with \`npm run gen:deployment\`; \`npm run check:generated\` fails
// when this file and the declarations disagree.
import type { PermissionRegistry } from "@/kernel/identity/permission-declaration";

export const PERMISSIONS: PermissionRegistry = {
  atoms: {
${lines(atoms, "No permission is declared.")}
  },
  routes: {
${lines(routes, "No route is declared yet.")}
  },
  actions: {
${lines(actions, "No action is declared yet.")}
  },
  implies: {
${lines(implies, "No fact implies a role yet.")}
  },
  roles: {
${lines([...bundles, ...leftOut], "No role bundle is declared.")}
  },
};
`;
}

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function generate(root, deploymentName, manifest = loadManifest(root)) {
  const deployments = loadDeployments(root);
  const deployment = deployments.find((d) => d.name === deploymentName);
  if (!deployment) {
    throw new Error(
      `gen-deployment: no deployments/${deploymentName}.json (have ${deployments.map((d) => d.name).join(", ") || "none"})`,
    );
  }
  const included = closureOf(manifest, deployment.entities);
  // The fork's registry is written into the overlay only where an overlay
  // exists. The fork itself has none (.github/ is excluded), and it regenerates
  // these files in its own tree, where asking for an overlay copy would make its
  // check:generated fail on a file it can never have.
  const crons = scheduledCronModules(root, included);
  // The fork receives a cron only when its file ships: an internal entity, or an
  // internal path of a portable one, stays behind.
  const forkCrons = crons.filter((c) => ships(c.body, manifest));
  const forkEvents = fs.existsSync(path.join(root, OVERLAY_DIR))
    ? {
        [GENERATED_FORK_EVENTS]: renderEvents(
          shippingOnly(subscribingEntities(root, manifest, included), manifest),
          deploymentName,
        ),
        [GENERATED_FORK_ROUTINES]: renderRoutines(forkCrons, deploymentName),
      }
    : {};
  return {
    [GENERATED]: renderEvents(subscribingEntities(root, manifest, included), deploymentName),
    ...forkEvents,
    [GENERATED_NAV]: renderNav(
      Object.fromEntries(
        SURFACES.map((s) => [s.binding, navContributingEntities(root, manifest, included, s.binding)]),
      ),
      deploymentName,
      unmountedRoutes(root, manifest, included),
    ),
    [GENERATED_CRONS]: renderVercelJson(root, included),
    [GENERATED_AUTOMATIONS]: renderAutomations(root, included),
    [GENERATED_ROUTINES]: renderRoutines(crons, deploymentName),
    [GENERATED_ENV]: renderEnv(root, manifest, included, deploymentName),
    [GENERATED_SHELL]: renderShell(included, deploymentName),
    [GENERATED_SEARCH]: renderSearch(searchContributingEntities(root, manifest, included), deploymentName),
    [GENERATED_PERMISSIONS]: renderPermissions(permissionsModel(root, manifest, included), deploymentName),
    [GENERATED_ACCESS]: renderAccess(accessContributingEntities(root, manifest, included), deploymentName),
  };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const name = process.env.EDGE8_DEPLOYMENT ?? "edge8";
  const files = generate(root, name);
  const check = process.argv.includes("--check");
  const stale = [];
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (current === body) continue;
    if (check) stale.push(rel);
    else {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
  }
  if (check && stale.length > 0) {
    console.error(
      `gen-deployment: ${stale.join(", ")} ${stale.length > 1 ? "are" : "is"} stale against ` +
        `deployments/${name}.json. Run \`npm run gen:deployment\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(
    check
      ? `check-generated: ${Object.keys(files).length} generated file(s) match deployments/${name}.json.`
      : `gen-deployment: wrote ${Object.keys(files).join(", ")} from deployments/${name}.json.`,
  );
}

// Compared as real paths: Node reports import.meta.url with symlinks resolved,
// so a tree under a symlinked directory (macOS's /var is /private/var) never
// matched argv, and stage-fork-tree.sh's regeneration silently did nothing.
const invokedDirectly =
  process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
