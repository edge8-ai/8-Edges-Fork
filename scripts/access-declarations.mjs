// The access declarations (ADR 0013): what each entity says, in its
// `permissions.ts`, about the permissions it offers, which roles hold each by
// default, which of its signed-in pages and server actions need which one, and
// which roles a fact it owns implies. The kernel declares its own atoms the same
// way, in kernel/identity/permissions.ts.
//
// Read as text, the way scripts/gen-app-mounts.mjs reads `mounts.ts`: this runs
// before a build and must not pull a TypeScript module into Node. The format is
// therefore strict, and a line the parser cannot read is a problem rather than
// a line skipped, so a reformatted file fails loudly instead of declaring less
// than it appears to.
//
// Two scripts consume this: gen-deployment.mjs, which writes the registry
// (app/permissions.ts) and refuses an invalid declaration, and check-access.mjs,
// which fails a signed-in page or a server-action file that has none.
import fs from "node:fs";
import path from "node:path";
import { extractFunctions, isServerActionFile } from "./check-action-auth.mjs";
import { appPathOf } from "./gen-app-mounts.mjs";

export const KERNEL_DECLARATION = "kernel/identity/permissions.ts";

/** The surfaces a person signs in to, and the kernel atom that enters each. */
export const SURFACE_ENTER = { admin: "surface.admin", team: "surface.team", portal: "surface.portal" };

/** What a sign-in page declares: nobody needs a permission to see it. */
export const PUBLIC = "public";

const SECTIONS = ["permissions", "holders", "roles", "routes", "actions", "implies"];
// An entity that bundles no role leaves `roles` out; every other section is
// always written, so a reformatted file that lost one still fails.
const OPTIONAL_SECTIONS = new Set(["roles"]);
/** A role bundle's three fields (AE.2), each one line inside its block. */
const ROLE_FIELDS = ["name", "sentence", "atoms"];
/** An atom's shape; the kernel's PERMISSION_ATOM, copied because node runs this file without TypeScript (pinned by a test).
    <owner>.<name>, or a view/manage pair <owner>.<name>.view and .manage (AE.1). */
export const ATOM = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.(view|manage))?$/;
const ROLE = /^[a-z][a-z0-9-]*$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const STRING = /"(?:[^"\\]|\\.)*"/.source;
const ENTRY = new RegExp(`^    (${STRING}): (${STRING}),$`);
const ROLE_START = new RegExp(`^    (${STRING}): \\{$`);
const ROLE_FIELD = new RegExp(`^      (${STRING}): (${STRING}),$`);
const DECLARATION = /^export const permissions: EntityPermissions = \{\n([\s\S]*?)\n\};$/m;
const SURFACE_ROUTE = new RegExp(`^routes/(${Object.keys(SURFACE_ENTER).join("|")})/`);
// Every sign-in page lives in a surface's (auth) route group, and only there may
// a page be public: anywhere else, `public` would let a dashboard page opt out.
const SIGN_IN_ROUTE = /^routes\/[a-z]+\/\(auth\)\//;

/**
 * One `permissions.ts`, as { permissions, holders, roles?, routes, actions, implies, problems }.
 * Every section is a flat map of string to string, one entry per line, except
 * `roles` (AE.2), where each role bundle is a block of three such lines:
 *
 *     "admin": {
 *       "name": "Admin",
 *       "sentence": "Runs the Admin view",
 *       "atoms": "surface.admin, boards.open, team.reviews:team",
 *     },
 *
 * `roles` is optional and is in the result only when the file has it, so the
 * result stays equal to what TypeScript compiles from the same file.
 */
export function parsePermissions(src) {
  const out = { permissions: {}, holders: {}, routes: {}, actions: {}, implies: {}, problems: [] };
  const m = DECLARATION.exec(src);
  if (!m) {
    out.problems.push("has no `export const permissions: EntityPermissions = { … };` declaration");
    return out;
  }
  const seen = new Set();
  let open = null;
  let role = null;
  for (const [i, line] of m[1].split("\n").entries()) {
    const unreadable = () =>
      out.problems.push(`line ${i + 1} of the declaration is not in the declaration format: ${JSON.stringify(line.trim())}`);
    if (line.trim() === "" || /^\s*\/\//.test(line)) continue;
    if (open === null) {
      const empty = /^ {2}([a-z]+): \{\},$/.exec(line);
      const start = /^ {2}([a-z]+): \{$/.exec(line);
      const name = (empty ?? start)?.[1];
      if (!name || !SECTIONS.includes(name)) {
        unreadable();
        continue;
      }
      if (seen.has(name)) out.problems.push(`section "${name}" appears twice`);
      seen.add(name);
      if (name === "roles") out.roles ??= {};
      if (start) open = name;
      continue;
    }
    if (role !== null) {
      if (line === "    },") {
        for (const field of ROLE_FIELDS) if (!(field in out.roles[role])) out.problems.push(`role "${role}" has no "${field}"`);
        role = null;
        continue;
      }
      const field = ROLE_FIELD.exec(line);
      if (!field) {
        unreadable();
        continue;
      }
      const [key, value] = [JSON.parse(field[1]), JSON.parse(field[2])];
      if (!ROLE_FIELDS.includes(key)) out.problems.push(`role "${role}" has a field "${key}"; a role has only ${ROLE_FIELDS.join(", ")}`);
      else if (key in out.roles[role]) out.problems.push(`role "${role}" names "${key}" twice`);
      else out.roles[role][key] = value;
      continue;
    }
    if (line === "  },") {
      open = null;
      continue;
    }
    if (open === "roles") {
      const start = ROLE_START.exec(line);
      if (!start) {
        unreadable();
        continue;
      }
      role = JSON.parse(start[1]);
      if (role in out.roles) out.problems.push(`role "${role}" appears twice in roles`);
      out.roles[role] = {};
      continue;
    }
    const entry = ENTRY.exec(line);
    if (!entry) {
      unreadable();
      continue;
    }
    const [key, value] = [JSON.parse(entry[1]), JSON.parse(entry[2])];
    if (key in out[open]) out.problems.push(`"${key}" appears twice in ${open}`);
    out[open][key] = value;
  }
  if (role !== null) out.problems.push(`role "${role}" is never closed`);
  if (open !== null) out.problems.push(`section "${open}" is never closed`);
  for (const name of SECTIONS) if (!seen.has(name) && !OPTIONAL_SECTIONS.has(name)) out.problems.push(`section "${name}" is missing`);
  return out;
}

export const SCOPES = ["own", "team", "clients", "all"];

/**
 * The grants a holders entry names, each a role and the scope it holds the atom
 * at: "team-member:own, manager:team, admin" → own, team, and all for a bare role.
 * A bundle's atoms are written the same way ("boards.open, team.reviews:team"),
 * so this reads them too, with the atom in `role`.
 */
export function holderGrants(value) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [role, scope = "all"] = part.split(":").map((x) => x.trim());
      return { role, scope };
    });
}

/** The .ts or .tsx source file a path within an entity names, or null when there is none. */
function sourceFileOf(root, target, rel) {
  for (const ext of [".ts", ".tsx"]) {
    const abs = path.join(root, target, `${rel}${ext}`);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

/** Whether a path within an entity lies in (or is) one of its internal pockets. */
function isInternal(rel, internalPaths) {
  return internalPaths.some((p) => {
    const pocket = p.replace(/\.tsx?$/, "");
    return rel === pocket || rel.startsWith(`${pocket}/`);
  });
}

/**
 * The kernel's declaration and every installed entity's, in install order:
 * { owner, target, file, ...parsed }. An entity without a `permissions.ts` has
 * not declared anything yet, which check-access reports page by page.
 *
 * A route or action in one of the entity's internal pockets (`internalPaths`)
 * whose file this tree does not have is dropped here, the way unmountedRoutes
 * drops its nav rows: upstream the file is always present, and the public fork
 * is staged without it and regenerates the registry there, so the fork's
 * registry simply lacks it instead of failing to generate.
 */
export function declarationsOf(root, manifest, included) {
  const out = [];
  const read = (owner, target, file, internalPaths) => {
    const parsed = parsePermissions(fs.readFileSync(path.join(root, file), "utf8"));
    for (const section of ["routes", "actions"]) {
      for (const key of Object.keys(parsed[section])) {
        const rel = key.split("#")[0];
        if (isInternal(rel, internalPaths) && !sourceFileOf(root, target, rel)) delete parsed[section][key];
      }
    }
    out.push({ owner, target, file, ...parsed });
  };
  if (fs.existsSync(path.join(root, KERNEL_DECLARATION))) read("kernel", "kernel", KERNEL_DECLARATION, []);
  for (const name of [...included].sort()) {
    const entity = manifest.entities[name];
    const file = `${entity.target}/permissions.ts`;
    if (fs.existsSync(path.join(root, file))) read(name, entity.target, file, entity.internalPaths ?? []);
  }
  return out;
}

/** Whether `name` is exported from `src`, by declaration or in an `export { … }` list. */
function exportsName(src, name) {
  if (new RegExp(`^export\\s+(?:async\\s+)?(?:function|const)\\s+${name}\\b`, "m").test(src)) return true;
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    if (m[1].split(",").some((part) => part.trim().split(/\s+as\s+/).pop()?.trim() === name)) return true;
  }
  return false;
}

/**
 * Every problem across the declarations, each naming its owner. Empty means
 * valid. `entityNames` is every entity in the catalogue, installed or not: a
 * kernel atom may not use one as its prefix, so who owns an atom always reads
 * off its key.
 */
export function validateDeclarations(root, declarations, entityNames = []) {
  const entities = new Set(entityNames);
  const problems = [];
  const ownerOf = new Map();
  for (const d of declarations) {
    for (const p of d.problems) problems.push(`${d.file}: ${p}`);
    for (const key of Object.keys(d.permissions)) {
      if (!ATOM.test(key)) problems.push(`${d.owner}: atom "${key}" is not of the form <owner>.<name>, or <owner>.<name>.view and .manage`);
      else if (d.owner === "kernel" && entities.has(key.split(".")[0])) {
        problems.push(`kernel: atom "${key}" uses the ${key.split(".")[0]} entity's namespace — a kernel atom names no entity`);
      } else if (d.owner !== "kernel" && !key.startsWith(`${d.owner}.`)) {
        problems.push(`${d.owner}: atom "${key}" must start with "${d.owner}." — an atom belongs to the entity that names it`);
      }
      if (!d.permissions[key].trim()) problems.push(`${d.owner}: atom "${key}" has no sentence`);
      // Holding manage reaches view (kernel/identity/access-model.ts viewOf),
      // so a manage whose view is undeclared would imply an atom nobody owns.
      const pair = /^(.+)\.manage$/.exec(key);
      if (pair && key.split(".").length === 3 && !(`${pair[1]}.view` in d.permissions)) {
        problems.push(`${d.owner}: atom "${key}" has no "${pair[1]}.view" — a manage atom implies its view, so declare both`);
      }
      if (ownerOf.has(key)) problems.push(`"${key}" is declared by both ${ownerOf.get(key)} and ${d.owner}`);
      else ownerOf.set(key, d.owner);
    }
  }

  // A route or action may name its own entity's atom or a kernel one, never a
  // peer's: if it could, one entity would again decide another's visibility.
  const refusalFor = (d, atom, label) => {
    const owner = ownerOf.get(atom);
    if (!owner) return `${d.owner}: ${label} names "${atom}", which no one declares`;
    if (owner !== d.owner && owner !== "kernel") return `${d.owner}: ${label} names "${atom}", which belongs to ${owner}`;
    return null;
  };

  for (const d of declarations) {
    for (const atom of Object.keys(d.permissions)) {
      if (!(atom in d.holders)) problems.push(`${d.owner}: atom "${atom}" names no default holders`);
    }
    for (const [atom, value] of Object.entries(d.holders)) {
      if (!(atom in d.permissions)) problems.push(`${d.owner}: holders names "${atom}", which this declaration does not offer`);
      const grants = holderGrants(value);
      if (grants.length === 0) problems.push(`${d.owner}: holders of "${atom}" names no role`);
      for (const { role, scope } of grants) {
        if (!ROLE.test(role)) problems.push(`${d.owner}: holders of "${atom}" names "${role}", which is not a role key`);
        if (!SCOPES.includes(scope)) problems.push(`${d.owner}: holders of "${atom}" gives ${role} the scope "${scope}", which is not one of ${SCOPES.join(", ")}`);
      }
      if (new Set(grants.map((g) => g.role)).size !== grants.length) problems.push(`${d.owner}: holders of "${atom}" names a role twice`);
    }
    for (const [key, atom] of Object.entries(d.routes)) {
      const surface = SURFACE_ROUTE.exec(key)?.[1];
      if (!surface || !/(^|\/)page$/.test(key) || !sourceFileOf(root, d.target, key)) {
        problems.push(`${d.owner}: ${key} is not a page this entity has on a signed-in surface (Admin, Team or Portal)`);
        continue;
      }
      if (atom === PUBLIC) {
        if (!SIGN_IN_ROUTE.test(key)) problems.push(`${d.owner}: ${key} is public, but only a sign-in page under (auth) may be`);
        continue;
      }
      const refusal = refusalFor(d, atom, key);
      if (refusal) {
        problems.push(refusal);
        continue;
      }
      const wrongSurface = Object.entries(SURFACE_ENTER).find(([s, enter]) => enter === atom && s !== surface);
      if (wrongSurface) problems.push(`${d.owner}: ${key} — a /${surface} route cannot require "${atom}"`);
    }
    for (const [key, atom] of Object.entries(d.actions)) {
      const [file, name] = key.split("#");
      const abs = sourceFileOf(root, d.target, file);
      const src = abs ? fs.readFileSync(abs, "utf8") : null;
      if (!src || !isServerActionFile(src)) {
        problems.push(`${d.owner}: ${file} is not a server-action file this entity has`);
        continue;
      }
      if (name !== undefined && (!IDENTIFIER.test(name) || !exportsName(src, name))) {
        problems.push(`${d.owner}: ${file} has no export ${name}`);
        continue;
      }
      if (atom === PUBLIC) {
        problems.push(`${d.owner}: action ${key} cannot be public — a public action is listed in scripts/action-auth-allowlist.json with its reason`);
        continue;
      }
      const refusal = refusalFor(d, atom, `action ${key}`);
      if (refusal) problems.push(refusal);
    }
    for (const [role, because] of Object.entries(d.implies)) {
      if (!ROLE.test(role)) problems.push(`${d.owner}: implied role "${role}" is not a role key`);
      if (!because.trim()) problems.push(`${d.owner}: implied role "${role}" does not say which fact implies it`);
    }
  }
  problems.push(...bundleShapeProblems(declarations));
  return problems;
}

/**
 * What is wrong with the role bundles' own shape, before any deployment is
 * asked about (AE.2): a key that is not a role key, a bundle with no name or
 * sentence, an atoms entry that is empty or names a scope that does not exist,
 * and two declarations bundling the same key. A bundle may not share its key
 * with a role a fact implies: a declared bundle is seeded as a granted role, and
 * one key cannot be both.
 */
function bundleShapeProblems(declarations) {
  const problems = [];
  const ownerOf = new Map();
  const implied = new Set(declarations.flatMap((d) => Object.keys(d.implies)));
  for (const d of declarations) {
    for (const [key, role] of Object.entries(d.roles ?? {})) {
      if (!ROLE.test(key)) problems.push(`${d.owner}: role "${key}" is not a role key`);
      if (ownerOf.has(key)) problems.push(`role "${key}" is bundled by both ${ownerOf.get(key)} and ${d.owner}`);
      else ownerOf.set(key, d.owner);
      if (implied.has(key)) problems.push(`${d.owner}: role "${key}" is bundled and also implied by a fact; a role is one or the other`);
      if (!role.name?.trim()) problems.push(`${d.owner}: role "${key}" has no name`);
      if (!role.sentence?.trim()) problems.push(`${d.owner}: role "${key}" has no sentence saying what holding it means`);
      const grants = holderGrants(role.atoms ?? "");
      if (grants.length === 0) problems.push(`${d.owner}: role "${key}" bundles no atom`);
      for (const { role: atom, scope } of grants) {
        if (!ATOM.test(atom)) problems.push(`${d.owner}: role "${key}" names "${atom}", which is not an atom`);
        if (!SCOPES.includes(scope)) problems.push(`${d.owner}: role "${key}" holds ${atom} at "${scope}", which is not one of ${SCOPES.join(", ")}`);
      }
      if (new Set(grants.map((g) => g.role)).size !== grants.length) problems.push(`${d.owner}: role "${key}" names an atom twice`);
    }
  }
  return problems;
}

/**
 * The role bundles one deployment seeds (AE.2), resolved against the whole
 * catalogue. `installed` is the kernel's and the installed entities'
 * declarations, `catalogue` every declaration this tree has, installed or not,
 * and `entityNames` every entity the manifest names.
 *
 * An atom a bundle names is one of three things. Declared by the kernel or an
 * installed entity: it is in the bundle. Declared by an entity this deployment
 * leaves out, or prefixed by a catalogued entity whose declaration this tree
 * does not have (the public fork is staged without its internal entities): it
 * is not installed. Anything else exists nowhere, and that is a build failure,
 * because a typo in a bundle would otherwise seed a role that opens nothing.
 *
 * An entity's bundle with an atom not installed is left out of the deployment
 * whole, so the minimal deployment has no role pointing at pages it lacks. The
 * kernel's bundles (Admin and Super Admin) are never left out, because every
 * deployment needs someone who runs it: they keep the atoms that are installed.
 * They are also locked on Settings → Access, so their atoms change only here,
 * and the default holders must say the same: every atom whose holders name
 * `admin` is in the Admin bundle at the same scope, and the other way round.
 *
 * Returns { roles, leftOut, problems }: roles as { key, owner, name, sentence,
 * locked, atoms: [{ permission, scope }] }, leftOut as { key, owner, missing }.
 */
export function resolveRoles({ installed, catalogue, entityNames }) {
  const entities = new Set(entityNames);
  const installedAtoms = new Set(installed.flatMap((d) => Object.keys(d.permissions)));
  const catalogueAtoms = new Set(catalogue.flatMap((d) => Object.keys(d.permissions)));
  const inTree = new Set(catalogue.map((d) => d.owner));
  const problems = [];
  const status = (atom) => {
    if (installedAtoms.has(atom)) return "installed";
    if (catalogueAtoms.has(atom)) return "absent";
    const prefix = atom.split(".")[0];
    return entities.has(prefix) && !inTree.has(prefix) ? "absent" : "unknown";
  };

  const roles = [];
  const leftOut = [];
  for (const d of installed) {
    for (const [key, role] of Object.entries(d.roles ?? {})) {
      const grants = holderGrants(role.atoms ?? "");
      const unknown = grants.filter((g) => status(g.role) === "unknown").map((g) => g.role);
      for (const atom of unknown) problems.push(`${d.owner}: role "${key}" names "${atom}", which no entity or the kernel declares`);
      if (unknown.length > 0) continue;
      const locked = d.owner === "kernel";
      const missing = grants.filter((g) => status(g.role) === "absent").map((g) => g.role);
      if (missing.length > 0 && !locked) {
        leftOut.push({ key, owner: d.owner, missing });
        continue;
      }
      const atoms = grants.filter((g) => status(g.role) === "installed").map((g) => ({ permission: g.role, scope: g.scope }));
      roles.push({ key, owner: d.owner, name: role.name, sentence: role.sentence, locked, atoms });
    }
  }

  // The locked bundles and the default holders, compared over the whole
  // catalogue so the answer does not depend on which deployment is built.
  for (const d of catalogue.filter((x) => x.owner === "kernel")) {
    for (const [key, role] of Object.entries(d.roles ?? {})) {
      const bundled = new Set(
        holderGrants(role.atoms ?? "").filter((g) => catalogueAtoms.has(g.role)).map((g) => `${g.role}:${g.scope}`),
      );
      const held = new Set();
      for (const c of catalogue) {
        for (const [atom, value] of Object.entries(c.holders)) {
          for (const g of holderGrants(value)) if (g.role === key) held.add(`${atom}:${g.scope}`);
        }
      }
      const onlyHeld = [...held].filter((x) => !bundled.has(x)).sort();
      const onlyBundled = [...bundled].filter((x) => !held.has(x)).sort();
      if (onlyHeld.length > 0) problems.push(`kernel: holders give ${key} ${onlyHeld.join(", ")}, which the ${key} bundle does not list`);
      if (onlyBundled.length > 0) problems.push(`kernel: the ${key} bundle lists ${onlyBundled.join(", ")}, which no holders entry gives ${key}`);
    }
  }
  return { roles, leftOut, problems };
}

/** Every page on a signed-in surface the installed entities have: { entity, key, appPath }. */
export function signedInRoutes(root, manifest, included) {
  const out = [];
  const walk = (dir, acc) => {
    if (!fs.existsSync(dir)) return acc;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/^page\.tsx?$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  for (const name of [...included].sort()) {
    const target = manifest.entities[name].target;
    for (const surface of Object.keys(SURFACE_ENTER)) {
      for (const abs of walk(path.join(root, target, "routes", surface), [])) {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out.push({ entity: name, key: rel.slice(`${target}/`.length).replace(/\.tsx?$/, ""), appPath: appPathOf(rel) });
      }
    }
  }
  return out.sort((a, b) => a.appPath.localeCompare(b.appPath));
}

/**
 * Every server-action file the installed entities have: { entity, key, file },
 * where `key` is its path within the entity without the extension, the way an
 * `actions` entry names it, and `file` its repository path. A file whose every
 * export is public (listed in the action-auth allowlist, with its reason, by
 * `<file> <export>`) needs no permission and is left out; so is one with no
 * export, which nothing can call.
 */
export function serverActionFiles(root, manifest, included, publicExports = new Set()) {
  const out = [];
  const walk = (dir, acc) => {
    if (!fs.existsSync(dir)) return acc;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  for (const name of [...included].sort()) {
    const target = manifest.entities[name].target;
    for (const abs of walk(path.join(root, target), [])) {
      const src = fs.readFileSync(abs, "utf8");
      if (!isServerActionFile(src)) continue;
      const file = path.relative(root, abs).split(path.sep).join("/");
      const exported = extractFunctions(src).filter((f) => f.exported).map((f) => f.name);
      if (exported.every((n) => publicExports.has(`${file} ${n}`))) continue;
      out.push({ entity: name, key: file.slice(`${target}/`.length).replace(/\.tsx?$/, ""), file });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
