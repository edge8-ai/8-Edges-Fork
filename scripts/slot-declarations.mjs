// The slots the entities provide, read from each provider's `slots.ts`, and the
// fence that keeps each one on the surfaces its provider declared (ADR 0026).
//
// A slot is how one entity's work appears on a page another entity owns, when
// the page's entity does not require the provider. Before ADR 0026 one slot was
// spelled in up to five places: a hand-kept list in scripts/gen-deployment.mjs,
// a type in kernel/shell/page-slots.ts, an import string the generator wrote by
// hand, the consumer's `mounts.ts`, and the provider's door. Now the provider
// declares it once, beside its `mounts.ts` (kernel/shell/page-slots.ts is the
// shape it is checked against), the consumer names the slots it takes in its
// own `mounts.ts`, and everything else is derived here:
//
//   gen-deployment.mjs  app/shell.ts: the exports, the type imports, the
//                       fallbacks, the registrations, and the stylesheets of
//                       the slots a hand-written shell takes
//   gen-app-mounts.mjs  the stylesheets of the slots a generated mount takes
//   slotFence()         a slot taken on a surface its provider did not declare,
//                       a slot nobody declares, a consumer listing a
//                       provider's stylesheet, and app/shell.ts loaded off the
//                       composition root or by any form but a named import
//
// Parsed rather than imported, like mounts.ts: this runs before a build and
// must not pull a TypeScript module into Node. The format is pinned (one
// `key: <JSON literal>,` per line), and a line it cannot read fails loudly.
//
// Deliberately dependency-free (Node built-ins only), like the other gates.
import fs from "node:fs";
import path from "node:path";
import { dynamicSpecifierPrefixes, importSpecifiers, resolveSpecifier, stripComments } from "./check-entity-imports.mjs";

export const SLOT_SURFACES = ["admin", "team", "portal", "public"];
const KINDS = ["component", "value", "registration"];
const KEYS = {
  component: ["kind", "type", "typeFrom", "styles", "surfaces", "why"],
  value: ["kind", "type", "typeFrom", "fallback", "styles", "surfaces", "why"],
  registration: ["kind", "type", "typeFrom", "register", "registerFrom", "styles", "surfaces", "why"],
};
const BARE_TYPE = /^[A-Z][A-Za-z0-9]*$/;
const OVERLAY = ".github/fork-overlay/";

/**
 * One entity's slots, in declaration order, as [{ name, kind, type, ... }].
 * Empty when the entity provides none (no slots.ts).
 */
export function slotsOf(root, target) {
  const rel = `${target}/slots.ts`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  const block = /^\/\*\* @generator \*\/\nexport const slots: SlotDeclarations = \{\n([\s\S]*?)\n\};$/m.exec(src);
  if (!block) throw new Error(`${rel}: declares no \`/** @generator */ export const slots: SlotDeclarations = { … };\` block in the pinned format`);
  const out = [];
  let current = null;
  for (const [i, line] of block[1].split("\n").entries()) {
    const where = `${rel}, line ${i + 1} of the slots block`;
    if (/^\s*(\/\/.*)?$/.test(line)) continue;
    const open = /^ {2}([A-Za-z_][A-Za-z0-9_]*): \{$/.exec(line);
    if (open) {
      if (current) throw new Error(`${where}: ${open[1]} opens before ${current.name} closes`);
      current = { name: open[1] };
      continue;
    }
    if (/^ {2}\},$/.test(line)) {
      if (!current) throw new Error(`${where}: a closing brace with no slot open`);
      out.push(current);
      current = null;
      continue;
    }
    const field = /^ {4}([A-Za-z]+): (.+),$/.exec(line);
    if (!field || !current) throw new Error(`${where}: \`${line.trim()}\` is not \`key: <JSON literal>,\` inside a slot`);
    try {
      current[field[1]] = JSON.parse(field[2]);
    } catch {
      throw new Error(`${where}: ${current.name}.${field[1]} is not a JSON literal (strings in double quotes, arrays of them)`);
    }
  }
  if (current) throw new Error(`${rel}: ${current.name} never closes`);
  return out;
}

/** Why a declaration is malformed, or nothing. */
function declarationErrors(root, slot, entity, portability) {
  const at = `entities/${entity}/slots.ts, ${slot.name}`;
  if (!KINDS.includes(slot.kind)) return [`${at}: kind must be one of ${KINDS.join(", ")}`];
  const errors = [];
  for (const key of Object.keys(slot)) if (key !== "name" && !KEYS[slot.kind].includes(key)) errors.push(`${at}: a ${slot.kind} slot does not take \`${key}\``);
  for (const key of ["type", "why"]) if (typeof slot[key] !== "string" || !slot[key]) errors.push(`${at}: \`${key}\` must be a non-empty string`);
  if (slot.kind === "value" && typeof slot.fallback !== "string") errors.push(`${at}: a value slot writes its fallback out as code, in \`fallback\``);
  if (slot.kind === "registration" && (typeof slot.register !== "string" || typeof slot.registerFrom !== "string")) errors.push(`${at}: a registration names its seam's \`register\` function and \`registerFrom\` module`);
  if (!Array.isArray(slot.styles)) errors.push(`${at}: \`styles\` must be a list, empty when the slot draws with what its page already loads`);
  for (const sheet of slot.styles ?? []) {
    if (typeof sheet !== "string" || !sheet.startsWith("@/") || !sheet.endsWith(".css")) errors.push(`${at}: stylesheet ${JSON.stringify(sheet)} must be an @/ path to a .css file`);
    else if (!fs.existsSync(path.join(root, sheet.slice(2)))) errors.push(`${at}: stylesheet ${sheet} does not exist`);
    // The sheet is imported from a file under app/, which may reach into an
    // entity only through its doors and routes/ (the boundary zones,
    // eslint.entities.mjs); a sheet anywhere else fails lint where it lands.
    else if (sheet.startsWith("@/entities/") && !/^@\/entities\/[^/]+\/routes\//.test(sheet)) errors.push(`${at}: stylesheet ${sheet} is inside an entity, where app/ may not import it; keep a slot's sheet under app/styles/ or the entity's routes/, or import it from the door`);
  }
  if (!Array.isArray(slot.surfaces) || slot.surfaces.length === 0 || slot.surfaces.some((s) => !SLOT_SURFACES.includes(s))) errors.push(`${at}: \`surfaces\` must list one or more of ${SLOT_SURFACES.join(", ")}`);
  if (slot.typeFrom !== undefined && !BARE_TYPE.test(slot.type)) errors.push(`${at}: \`typeFrom\` imports a bare type name, and ${JSON.stringify(slot.type)} is not one`);
  // An internal provider is absent from the public fork, where a portable
  // consumer must still compile against the slot's type (ADR 0026).
  if (portability === "internal" && BARE_TYPE.test(slot.type) && !slot.typeFrom?.startsWith("@/kernel/")) errors.push(`${at}: ${entity} is internal, so the slot's type must come from the kernel (\`typeFrom: "@/kernel/…"\`): the fork has no ${entity} to import it from`);
  return errors;
}

/**
 * Every slot the entities in the manifest provide, as
 * [{ name, entity, internal, kind, type, typeFrom?, fallback?, register?, registerFrom?, styles, surfaces, why }],
 * by provider name and then declaration order. Throws on a malformed
 * declaration or a name two providers claim, because app/shell.ts exports
 * each name once.
 *
 * `included`, when given, is the deployment's installed entities. An internal
 * provider the deployment does not install is then not read at all: Khoa
 * decided on 2026-10-29 that an internal provider declares its slots in its
 * own slots.ts like any other ("in the entity", ADR 0026), and that a
 * deployment without it (the public fork, minimal) never reads that file, so
 * its consumers' pages get the empty fallback. A portable provider is read
 * whether installed or not, because the hand-written shells take some of its
 * slots in every deployment and need their fallbacks, and a portable entity
 * ships in every tree.
 */
export function loadSlots(root, manifest, included = null) {
  const out = [];
  const errors = [];
  for (const entity of Object.keys(manifest.entities).sort()) {
    const { target, portability } = manifest.entities[entity];
    if (included && portability === "internal" && !included.has(entity)) continue;
    for (const slot of slotsOf(root, target)) {
      errors.push(...declarationErrors(root, slot, entity, portability));
      const clash = out.find((s) => s.name === slot.name);
      if (clash) errors.push(`entities/${entity}/slots.ts declares ${slot.name}, which entities/${clash.entity}/slots.ts already declares`);
      out.push({ ...slot, entity, internal: portability === "internal" });
    }
  }
  if (errors.length > 0) throw new Error(`slot declarations:\n  ${errors.join("\n  ")}`);
  return out;
}

/** The surface a page under an entity's routes/ belongs to, from its key in mounts.ts; null for an api route or a cron. */
export function surfaceOfRoute(key) {
  if (!key.startsWith("routes/")) return null;
  const top = key.split("/")[1];
  return ["admin", "team", "portal"].includes(top) ? top : "public";
}

/** The surface a file under app/ belongs to; the root layout wraps every page and draws the public frame, so it is public. */
export function surfaceOfAppFile(rel) {
  const top = rel.split("/")[1];
  return ["admin", "team", "portal"].includes(top) ? top : "public";
}

function sourcesUnder(root, dir, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__" && e.name !== "__fixtures__") sourcesUnder(root, rel, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\.(ts|tsx|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * Who takes from app/shell.ts outside the generated files, and how: for each
 * hand-written file that loads it, { file, surface, names } when every load is
 * a named import, and the violations otherwise. Only a file under app/ (or the
 * fork overlay's app/) may load it, because only the composition root may name
 * what a deployment installs; an entity or the kernel never may.
 */
export function shellTakers(root, files = [...sourcesUnder(root, "app"), ...sourcesUnder(root, "entities"), ...sourcesUnder(root, "kernel"), ...sourcesUnder(root, `${OVERLAY}app`)]) {
  const takers = [];
  const violations = [];
  for (const file of files) {
    const logical = file.startsWith(OVERLAY) ? file.slice(OVERLAY.length) : file;
    if (logical === "app/shell.ts") continue;
    const source = fs.readFileSync(path.join(root, file), "utf8");
    if (/^\/\/ GENERATED by scripts\//.test(source.split("\n").find((l) => l.startsWith("//")) ?? "")) continue;
    const verdict = shellTake(logical, source);
    if (!verdict) continue;
    if (verdict.violations.length > 0) violations.push(...verdict.violations.map((v) => (file === logical ? v : `${v} (in the fork overlay)`)));
    else takers.push({ file: logical, surface: surfaceOfAppFile(logical), names: verdict.names });
  }
  return { takers, violations };
}

/**
 * How one file takes from app/shell.ts: null when it does not load it,
 * otherwise the names it takes and why its form of load is refused. A
 * namespace, default, bare, required, re-exported or dynamic load could read a
 * slot unseen, so only `import { a, b } from "@/app/shell"` is allowed.
 */
export function shellTake(file, source) {
  const toShell = (spec) => resolveSpecifier(spec, file) === "app/shell";
  const specs = importSpecifiers(source).filter(toShell);
  const dynamic = dynamicSpecifierPrefixes(source).filter((prefix) => {
    const t = prefix.startsWith("@/") ? prefix.slice(2) : prefix.startsWith(".") ? path.posix.join(path.posix.dirname(file), prefix) : null;
    return t !== null && ("app/shell".startsWith(t) || t.startsWith("app/shell"));
  });
  if (specs.length === 0 && dynamic.length === 0) return null;
  const violations = [];
  if (!file.startsWith("app/")) violations.push(`${file} loads app/shell.ts, which only a file under app/ may: an entity or the kernel takes a slot through its mount's \`slots\``);
  const names = [];
  const src = stripComments(source);
  let statements = 0;
  // One statement's clause: it may not run into the next import, since a file need not end statements with ";".
  for (const m of src.matchAll(/\b(import|export)\s+((?:(?!\b(?:import|export)\b)[^;])*?)\s*from\s*["'`]([^"'`]+)["'`]/g)) {
    if (!toShell(m[3])) continue;
    statements += 1;
    const clause = m[2].trim();
    const named = m[1] === "import" ? /^(?:type\s+)?\{([^}]*)\}$/.exec(clause) : null;
    if (!named) {
      violations.push(`${file} takes app/shell.ts as \`${m[1]} ${clause} from\`: only a named import is allowed, so no slot can be read unseen`);
      continue;
    }
    names.push(...named[1].split(",").map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]).filter(Boolean));
  }
  // Every specifier not accounted for by an `import … from` or `export … from` statement is a bare, dynamic or required load.
  if (specs.length > statements || dynamic.length > 0) violations.push(`${file} loads app/shell.ts by a bare, dynamic or required import: only a named import is allowed`);
  return { names, violations };
}

/**
 * What the fence refuses, as one message per violation; empty when every slot
 * stands where its provider allows. `mounts` is [{ entity, key, mount }] for
 * every entity's mounts.ts entries (gen-app-mounts.mjs's mountsOf), `takers`
 * the hand-written files that take from app/shell.ts. Every entity is checked,
 * installed or not, because the fence holds for every deployment.
 *
 * `forkTree` is true in the public fork, where the internal providers' folders
 * are gone with their slots.ts. A mount there may name a slot no file in the
 * tree declares: it is an internal provider's, its mount passes null, and the
 * name was held by this same fence upstream, where every provider is read.
 */
export function slotFence(slots, mounts, shell, { forkTree = false } = {}) {
  const byName = new Map(slots.map((s) => [s.name, s]));
  const sheetOwner = new Map(slots.flatMap((s) => s.styles.map((sheet) => [sheet, s])));
  const out = [...shell.violations];
  const judge = (where, surface, name) => {
    const slot = byName.get(name);
    if (!slot) {
      if (!forkTree) out.push(`${where} takes the slot ${name}, which no entity's slots.ts declares`);
    }
    else if (slot.kind === "registration") out.push(`${where} takes the slot ${name}, a registration: it exports nothing to take`);
    else if (!slot.surfaces.includes(surface)) out.push(`${where} takes ${name} on the ${surface} surface, but entities/${slot.entity}/slots.ts declares it for ${slot.surfaces.join(", ")} alone`);
  };
  for (const { entity, key, mount } of mounts) {
    const where = `entities/${entity}/mounts.ts (${key})`;
    const surface = surfaceOfRoute(key);
    for (const name of Object.values(mount.slots ?? {})) {
      if (surface === null) out.push(`${where} gives a slot to a route that is not a page`);
      else judge(where, surface, name);
    }
    for (const sheet of mount.styles ?? []) {
      const owner = sheetOwner.get(sheet);
      if (owner && owner.entity !== entity) out.push(`${where} lists ${sheet}, which comes with the ${owner.name} slot of ${owner.entity}: a consumer never lists a provider's stylesheet`);
    }
  }
  for (const { file, surface, names } of shell.takers) {
    for (const name of names) {
      judge(file, surface, name);
      // A hand-written shell is in every deployment, and an internal provider's
      // slot is absent from every deployment without it (ADR 0026, decided
      // 2026-10-29), so the shell's import would not resolve there.
      if (byName.get(name)?.internal) out.push(`${file} takes ${name}, a slot of the internal ${byName.get(name).entity}: a hand-written shell may take only a portable provider's slots, through a mount instead`);
    }
  }
  return out;
}

/**
 * The stylesheets a generated mount loads for the slots it takes, in the order
 * it names them, for the providers this deployment installs.
 */
export function slotStyles(mountSlots, slots, included) {
  const out = [];
  for (const name of Object.values(mountSlots ?? {})) {
    const slot = slots.find((s) => s.name === name);
    if (slot && included.has(slot.entity)) for (const sheet of slot.styles) if (!out.includes(sheet)) out.push(sheet);
  }
  return out;
}
