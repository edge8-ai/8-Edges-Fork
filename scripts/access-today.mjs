// Do the access declarations reproduce today? (ADR 0013, AC.5)
//
// Move 2 swaps every page's guard for requirePermission and must change nobody's
// access. Before any guard moves, this reads who passes each signed-in page
// today straight from the code — the surface layout under app/, every layout
// above the page in its entity, and the page's own guards — and compares it,
// persona by persona, with who the page's declaration lets in. A difference is a
// declaration that would change someone's access the day its page is swapped.
//
// Today's gates are the guard calls (requireAdmin and its siblings) and the data
// gates a page redirects on (`if (!(await isHiringManager(…))) redirect(…)`).
// Comments are stripped first: the (auth) layouts mention requireTeamMember only
// to say they are deliberately ungated. A gate inside the page that hides a
// section rather than refusing the page is not a page gate, and is not here.
import fs from "node:fs";
import path from "node:path";
import { stripComments } from "./check-entity-layers-walk.mjs";
import { declarationsOf, holderGrants, signedInRoutes, PUBLIC, SURFACE_ENTER } from "./access-declarations.mjs";

/**
 * The kinds of person who sign in today, as the roles the resolver will give
 * them. An admin also holds Hiring manager, because isHiringManager counts
 * admins, as the hiring board does today.
 */
export const PERSONAS = {
  admin: ["admin", "hiring-manager"],
  "super-admin": ["admin", "super-admin", "hiring-manager"],
  "admin-on-the-team": ["admin", "team-member", "hiring-manager"],
  member: ["team-member"],
  contractor: ["contractor"],
  "member-with-revenue": ["team-member", "revenue"],
  manager: ["team-member", "manager"],
  coach: ["team-member", "coach"],
  "hiring-manager": ["team-member", "hiring-manager"],
  client: ["client-user"],
};

/** Who passes each gate today, as a test over a persona's roles. */
export const GATES = {
  requireAdmin: (r) => r.includes("admin"),
  requireSuperAdmin: (r) => r.includes("super-admin"),
  requireRevenueAccess: (r) => r.includes("admin") || r.includes("revenue"),
  requireTeamMember: (r) => r.includes("team-member") || r.includes("contractor"),
  requirePortalMember: (r) => r.includes("client-user"),
  isHiringManager: (r) => r.includes("hiring-manager"),
};

const GUARD_CALL = /\b(requireAdmin|requireSuperAdmin|requireRevenueAccess|requireTeamMember|requirePortalMember)\(\)/g;
// A page guarded the new way: `perm:<atom>`, passed by whoever holds the atom.
const PERMISSION_CALL = /\brequirePermission\("([^"]+)"/g;
const DATA_GATE = /if\s*\(\s*!\s*\(?\s*await\s+(isHiringManager)\(/g;

/** The gates one file applies, from its source with comments removed. */
export function gatesIn(source) {
  const src = stripComments(source);
  return [
    ...new Set([
      ...[...src.matchAll(GUARD_CALL), ...src.matchAll(DATA_GATE)].map((m) => m[1]),
      ...[...src.matchAll(PERMISSION_CALL)].map((m) => `perm:${m[1]}`),
    ]),
  ];
}

/**
 * Whether a persona's roles pass one gate. A `perm:<atom>` gate is passed by
 * whoever holds the atom by default (`holders`: atom → role keys), so a page
 * newer than the frozen record is read through its own declaration.
 */
export function passes(gate, roles, holders) {
  if (gate.startsWith("perm:")) return (holders.get(gate.slice(5)) ?? []).some((r) => roles.includes(r));
  return GATES[gate](roles);
}

/** Every file whose gates apply to a page: the app/ surface layout, then each entity layout above it, then the page. */
export function chainOf(root, target, key) {
  const files = [];
  const surface = /^routes\/(admin|team|portal)\/\(dashboard\)\//.exec(key)?.[1];
  if (surface) files.push(path.join(root, "app", surface, "(dashboard)", "layout.tsx"));
  const parts = key.split("/");
  for (let i = 1; i < parts.length; i++) {
    const layout = path.join(root, target, ...parts.slice(0, i), "layout.tsx");
    if (fs.existsSync(layout)) files.push(layout);
  }
  const page = path.join(root, target, `${key}.tsx`);
  files.push(page);
  // A page that re-exports another route's page ("the admin page, served again
  // under /team") carries that page's own guards; the other page's layouts do
  // not run here, so only the page itself is followed.
  if (fs.existsSync(page)) {
    const m = /export\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s*["']@\/([^"']+)["']/.exec(stripComments(fs.readFileSync(page, "utf8")));
    if (m) for (const ext of [".tsx", ".ts"]) if (fs.existsSync(path.join(root, m[1] + ext))) files.push(path.join(root, m[1] + ext));
  }
  return files.filter((f) => fs.existsSync(f));
}

/** Who passes each declared signed-in page's code gates: { appPath: [persona, …] }. */
export function todayOf(root, manifest, included) {
  const holders = new Map();
  for (const d of declarationsOf(root, manifest, included)) {
    for (const [atom, value] of Object.entries(d.holders)) holders.set(atom, holderGrants(value).map((g) => g.role));
  }
  const out = {};
  for (const route of signedInRoutes(root, manifest, included)) {
    const target = manifest.entities[route.entity].target;
    const gates = chainOf(root, target, route.key).flatMap((f) => gatesIn(fs.readFileSync(f, "utf8")));
    out[route.appPath] = Object.entries(PERSONAS)
      .filter(([, roles]) => gates.every((g) => passes(g, roles, holders)))
      .map(([persona]) => persona);
  }
  return out;
}

export const TODAY_BASELINE = "scripts/access-today-baseline.json";

/** The frozen record of who reached each page before gates were swapped, or null. */
export function readTodayBaseline(root) {
  const file = path.join(root, TODAY_BASELINE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * Every (page, persona) where today's code and the declaration disagree:
 * { appPath, persona, today, declared }. Empty means the declarations
 * reproduce today exactly.
 */
export function compareWithToday(root, manifest, included, baseline = readTodayBaseline(root)) {
  const declarations = declarationsOf(root, manifest, included);
  const holders = new Map();
  for (const d of declarations) {
    for (const [atom, value] of Object.entries(d.holders)) holders.set(atom, holderGrants(value).map((g) => g.role));
  }
  const atomOf = new Map();
  for (const d of declarations) for (const [key, atom] of Object.entries(d.routes)) atomOf.set(`${d.owner} ${key}`, atom);
  const holds = (roles, atom) => (holders.get(atom) ?? []).some((role) => roles.includes(role));

  const out = [];
  for (const route of signedInRoutes(root, manifest, included)) {
    const atom = atomOf.get(`${route.entity} ${route.key}`);
    if (!atom) continue; // undeclared pages are check:access's business
    const target = manifest.entities[route.entity].target;
    const gates = chainOf(root, target, route.key).flatMap((f) => gatesIn(fs.readFileSync(f, "utf8")));
    const surface = /^routes\/(admin|team|portal)\//.exec(route.key)[1];
    // The frozen record decides for a page it knows; a page newer than the
    // record is read from its own gates.
    const recorded = baseline?.pages?.[route.appPath];
    for (const [persona, roles] of Object.entries(PERSONAS)) {
      const today = recorded ? recorded.includes(persona) : gates.every((g) => passes(g, roles, holders));
      const declared = atom === PUBLIC || (holds(roles, SURFACE_ENTER[surface]) && holds(roles, atom));
      if (today !== declared) out.push({ appPath: route.appPath, persona, today, declared, atom, gates });
    }
  }
  return out;
}

const AC8 =
  "AC.8 (decided 2026-10-06): the page now opens only to the people its sidebar row was for. " +
  "Its own code already turned the others away: an empty roster, nothing waiting, no assigned client, no reports.";

const AC19 = {
  only: ["contractor"],
  why:
    "AC.19 (decided on Claude Fable 5.1, 2026-10-06): the Contractor baseline keeps the Team view, the onboarding " +
    "reading and their own pages; who's who, the plans, ideas, vendors and group coaching come with the Company " +
    "module, and health cover stays with team members.",
};

/**
 * The only pages where a declaration and the frozen record of today may
 * disagree, each with why: a reason that holds for every persona, or
 * `{ only, why }` for the personas it names. Every one only refuses; none lets
 * anyone in.
 */
export const INTENDED_DIFFERENCES = {
  // Old-bookmark redirects to /team/revenue/events, which the Revenue permission
  // guards. Today a member without Revenue is redirected and then refused; the
  // declaration refuses them one hop sooner. Nobody reaches any data either way.
  "app/team/(dashboard)/revenue/registrations/page.tsx": "a redirect to a Revenue page",
  "app/team/(dashboard)/revenue/public-retreats/page.tsx": "a redirect to a Revenue page",
  // Coaching: coaches and managers. Clients: whoever is on a client's team.
  // Onboarding board: managers.
  "app/team/(dashboard)/coaching/page.tsx": AC8,
  "app/team/(dashboard)/coaching/[profileId]/page.tsx": AC8,
  // Z.2.1: the approvals inbox opens to every team login (surface.team), and
  // the approvals reader decides which rows each sees. Before it, only managers
  // and the Approver role opened it, and a Finance checker or a Revenue
  // approver with a claim or a draft waiting on their role could not.
  "app/team/(dashboard)/approvals/page.tsx": "Z.2.1: the approvals inbox opens to every team login; the reader filters its rows",
  "app/team/(dashboard)/onboarding/page.tsx": AC8,
  "app/team/(dashboard)/clients/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/board/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/documents/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/invoices/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/meetings/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/meetings/[id]/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/roadmap/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/(hub)/team/page.tsx": AC8,
  "app/team/(dashboard)/clients/[companyId]/programs/[programId]/page.tsx": AC8,
  "app/team/(dashboard)/directory/page.tsx": AC19,
  "app/team/(dashboard)/directory/[id]/page.tsx": AC19,
  "app/team/(dashboard)/org/page.tsx": AC19,
  "app/team/(dashboard)/company-goals/page.tsx": AC19,
  "app/team/(dashboard)/strategy/page.tsx": AC19,
  "app/team/(dashboard)/ideas/page.tsx": AC19,
  "app/team/(dashboard)/ideas/[id]/page.tsx": AC19,
  "app/team/(dashboard)/vendors/page.tsx": AC19,
  "app/team/(dashboard)/vendors/new/page.tsx": AC19,
  "app/team/(dashboard)/coaching-sessions/page.tsx": AC19,
  "app/team/(dashboard)/coaching-sessions/[id]/page.tsx": AC19,
  "app/team/(dashboard)/insurance/page.tsx": AC19,
};

/** Whether a (page, persona) difference is one the list above intends. */
export function isIntended(appPath, persona) {
  const entry = INTENDED_DIFFERENCES[appPath];
  if (!entry) return false;
  return typeof entry === "string" || entry.only.includes(persona);
}
