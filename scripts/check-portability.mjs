// Fails when code that ships to the fork imports code that does not, or reads a
// table that does not (ADR 0001, "Every entity is marked internal or portable in
// the catalogue, and a portable entity may never require an internal one").
//
// Why this exists
// ---------------
// .github/fork-sync-exclude.txt is a DENYLIST: anything nobody remembered to
// name ships by default. That posture is what put entities/htt (Edge8's own
// cost-of-delivery telemetry, five crons and an eleven-table schema), the AIO
// Pad admin page and the retreat P&L into two client forks,
// where they had to be removed by hand afterwards — twice, and incompletely
// both times.
//
// The manifest's `portability` field turns that around. Each entity is decided
// once; scripts/gen-fork-excludes.mjs turns the decision into exclude lines, and
// this gate proves the decision is CONSISTENT — that the tree left standing
// after those exclusions still compiles.
//
// The rule
// --------
// A file SHIPS when its owner is a portable entity (or the kernel, or app/) and
// it does not sit under one of that entity's `internalPaths`. The rule is then a
// single closure property:
//
//   every local import of a shipping file must itself ship.
//
// That subsumes the two rules ADR 0001 states separately — a portable entity may
// not import an internal entity's door, and may not reach an internal pocket of
// its own — and it answers the question the sync actually cares about, which is
// not "is the boundary tidy" but "does the fork build".
//
// The table rule (ADR 0031) is the same property for data:
//
//   no shipping file reads or writes a table an internal entity owns.
//
// The fork's database will not have that table, so the query fails at run time
// in a build that compiled. Table accesses are read by check-table-ownership's
// parser (`.from("t")`, `.from(CONST)` and PostgREST embeds), so the two gates
// see the same reads. Test files are left out: they mock the client. Its blind
// spots are that gate's: a table named by a runtime value is not seen.
//
// Unlike check-requires.mjs this walks EVERY file, not just door graphs: a
// route body that app/ mounts is exactly the kind of file the fork needs, and it
// sits outside every door graph by design.
//
//   node scripts/check-portability.mjs            gate
//   node scripts/check-portability.mjs --explain  group violations by target
//   node scripts/check-portability.mjs --list     print the shipping file set
//
// Deliberately dependency-free (Node built-ins only), like the other gates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KERNEL, APP_ROOT, entityOf, loadManifest, ownershipEntries } from "./entity-manifest.mjs";
import { resolveLocal, valueSpecifiers } from "./check-entity-layers-walk.mjs";
import { isForkTree, skippedInFork } from "./fork-tree.mjs";
import { TYPES_FILE, embedResolver, tableAccesses } from "./check-table-ownership.mjs";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "video"]);
const CODE = /\.(ts|tsx)$/;
export const BASELINE_FILE = "scripts/portability-baseline.json";
export const OVERLAY_DIR = ".github/fork-overlay";

/**
 * Generated files the fork staging writes again in the staged tree
 * (.github/scripts/stage-fork-tree.sh), from the fork's own manifest and slot
 * declarations. Upstream's copy is never what the fork gets, so its imports
 * are not checked here, as with an overlay. app/shell.ts is the one that
 * matters: upstream it imports an installed internal provider's slots (htt's
 * humanTokens, ADR 0026 decided 2026-10-29), and the fork's copy, written
 * without htt, does not.
 */
export const REGENERATED_IN_FORK = ["app/shell.ts"];

/**
 * True when the fork overlay supplies its own file at this path.
 *
 * stage-fork-tree.sh copies .github/fork-overlay/ over the staged tree after
 * the exclusions run, so an excluded path that the overlay also provides is not
 * missing in the fork — it is different there. An import of one is therefore not
 * a broken import, and the gate must not call it one, or the only way to ship a
 * page whose internal half is stubbed out would be to duplicate the whole page.
 */
export function overlayProvides(root, rel) {
  const bare = rel.replace(/\.(ts|tsx)$/, "");
  return [rel, `${bare}.ts`, `${bare}.tsx`].some((c) =>
    fs.existsSync(path.join(root, OVERLAY_DIR, c)),
  );
}

/**
 * Violations that predate this gate, as "importer -> target" strings.
 *
 * A ratchet rather than an exemption, in the same shape as
 * scripts/lint-warning-baseline.json: an entry that is no longer a violation
 * FAILS the gate, so the file can only shrink. Every line here is a page that
 * mixes portable and internal content and needs splitting — the fork gets these
 * files with an unresolvable import until it is done, which is why the fork sync
 * overlays them (.github/fork-overlay/) in the meantime.
 *
 * An entry is the key as a string, or `{ edge, reason }` when it needs saying
 * why it is held, as every table read does: a reason must not be empty.
 */
export function loadBaseline(root) {
  const file = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(file)) return new Set();
  const known = JSON.parse(fs.readFileSync(file, "utf8")).known ?? [];
  return new Set(
    known.map((e) => {
      if (typeof e === "string") return e;
      if (typeof e?.edge !== "string" || typeof e.reason !== "string" || !e.reason.trim()) {
        throw new Error(`${BASELINE_FILE}: an object entry needs an "edge" and a non-empty "reason" (${JSON.stringify(e)})`);
      }
      return e.edge;
    }),
  );
}

/** Every .ts/.tsx file in the tree, repo-relative, excluding build and vendor dirs. */
export function sourceFiles(root, dir = "", out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      sourceFiles(root, rel, out);
    } else if (CODE.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Why a path does not ship, or null when it does. The reason is carried through
 * to the error message: "internal entity" and "internal path" call for different
 * fixes, and a violation that names neither is one nobody can act on.
 */
export function shipBlocker(rel, manifest, entries = ownershipEntries(manifest), root = null) {
  if (root && overlayProvides(root, rel)) return null;
  const owner = entityOf(rel, manifest, entries);
  if (owner === KERNEL || owner === APP_ROOT) return null;
  const entity = manifest.entities[owner];
  if (!entity) return null; // unassigned: check-entity-imports' business, not ours
  if (entity.portability === "internal") return `internal entity "${owner}"`;
  for (const inner of entity.internalPaths ?? []) {
    const prefix = `${entity.target}/${inner}`;
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return `internal path "${owner}:${inner}"`;
    // Extension siblings ride the same decision, matching entryMatches() in
    // entity-manifest.mjs: naming lib/tokens.ts internal has to take
    // lib/tokens.test.ts with it, or the test ships without the module it
    // imports — which is both a broken build and a copy of the internal code.
    const stem = prefix.replace(/\.[a-z]+$/i, "");
    if (rel.startsWith(`${stem}.`)) return `internal path "${owner}:${inner}"`;
  }
  return null;
}

export function ships(rel, manifest, entries = ownershipEntries(manifest)) {
  return shipBlocker(rel, manifest, entries) === null;
}

/**
 * app/ mounts that exist only to re-export something that does not ship.
 *
 * A route file under app/ is a one-line mount of an entity's route body, so a
 * mount of an internal route is internal too — excluding the body and keeping
 * the mount would leave Next resolving a module that is not there. Derived
 * rather than listed, so a new internal route cannot be half-excluded: the
 * generator and this gate both read it from here.
 */
export function nonShippingMounts(root, manifest, entries = ownershipEntries(manifest), files = sourceFiles(root)) {
  const out = new Map();
  for (const rel of files) {
    if (entityOf(rel, manifest, entries) !== APP_ROOT) continue;
    const specs = valueSpecifiers(fs.readFileSync(path.join(root, rel), "utf8"))
      .map((spec) => resolveLocal(root, spec, rel))
      .filter((r) => r !== null);
    if (specs.length === 0) continue;
    const blockers = specs.map((r) => shipBlocker(r, manifest, entries));
    // Every local import blocked: the file has no shipping purpose left.
    if (blockers.every((b) => b !== null)) out.set(rel, blockers[0]);
  }
  return out;
}

/**
 * Every edge from a shipping file to a non-shipping one:
 * { importer, target, reason }.
 */
export function checkPortability(root, manifest = loadManifest(root)) {
  const entries = ownershipEntries(manifest);
  const files = sourceFiles(root);
  const mounts = nonShippingMounts(root, manifest, entries, files);
  const blocked = (rel) => mounts.get(rel) ?? shipBlocker(rel, manifest, entries, root);
  // An overlay-provided path is fine as an import TARGET — the fork has a file
  // there — but its upstream content is not what the fork gets, so walking this
  // copy's imports would check a file that never ships. The overlay's own copy
  // is checked by the fork build, not from here.
  const shipping = files.filter((f) => blocked(f) === null && !overlayProvides(root, f) && !REGENERATED_IN_FORK.includes(f));
  const violations = [];
  for (const rel of shipping) {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    for (const spec of valueSpecifiers(source)) {
      const next = resolveLocal(root, spec, rel);
      if (next === null) continue;
      const blocker = blocked(next);
      if (blocker) violations.push({ importer: rel, target: next, reason: blocker });
    }
  }
  return { files: files.length, shipping: shipping.length, mounts, violations, tableReads: tableReads(root, manifest, shipping) };
}

const TEST_FILE = /(^|\/)__tests__\/|\.test\.(ts|tsx)$/;

/**
 * Every access from a shipping file to a table an internal entity owns, once
 * per file and table: { importer, target: "table <name>", reason }.
 */
export function tableReads(root, manifest, shipping) {
  const internal = internalTables(manifest);
  if (internal.size === 0) return [];
  // The embed resolver reads the generated types; a tree without them (a
  // fixture) takes each embedded name as the table it names.
  const resolve = fs.existsSync(path.join(root, TYPES_FILE)) ? embedResolver(root) : (access) => access;
  // An internal entity's ownedPaths (its scripts and Supabase functions) are
  // excluded from the fork by gen-fork-excludes, but entityOf does not read
  // them, so they count as shipping here. Their reads are the owner's own.
  const ownedElsewhere = Object.values(manifest.entities)
    .filter((e) => e.portability === "internal")
    .flatMap((e) => e.ownedPaths ?? []);
  const out = [];
  for (const rel of shipping) {
    if (TEST_FILE.test(rel) || ownedElsewhere.some((p) => rel === p || rel.startsWith(`${p}/`))) continue;
    const seen = new Set();
    for (const { table } of tableAccesses(fs.readFileSync(path.join(root, rel), "utf8")).map(resolve)) {
      const owner = internal.get(table);
      if (!owner || seen.has(table)) continue;
      seen.add(table);
      out.push({ importer: rel, target: `table ${table}`, reason: `table of internal entity "${owner}"` });
    }
  }
  return out;
}

export const edgeKey = (v) => `${v.importer} -> ${v.target}`;

/** Violations above the baseline, and baseline entries that are now stale. */
export function ratchet(violations, baseline) {
  const seen = new Set(violations.map(edgeKey));
  return {
    above: violations.filter((v) => !baseline.has(edgeKey(v))),
    stale: [...baseline].filter((k) => !seen.has(k)),
  };
}

/** Tables owned by an internal entity — data the fork's database will not have. */
export function internalTables(manifest) {
  const out = new Map();
  for (const [name, entity] of Object.entries(manifest.entities)) {
    if (entity.portability !== "internal") continue;
    for (const t of entity.tables ?? []) out.set(t, name);
  }
  return out;
}

function main() {
  // `--root <dir>` points the gate at another tree; its fires test uses it.
  const rootAt = process.argv.indexOf("--root");
  const root =
    rootAt === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(process.argv[rootAt + 1] ?? ".");
  if (isForkTree(root)) {
    // The gate decides what may leave the upstream; the fork is what left. An
    // import the sync broke would be a missing file there, which the fork's
    // own typecheck and build report.
    skippedInFork("check-portability", "this tree is what the upstream's portability decision shipped.");
    return;
  }
  const manifest = loadManifest(root);
  const explain = process.argv.includes("--explain");

  if (process.argv.includes("--list")) {
    const entries = ownershipEntries(manifest);
    const files = sourceFiles(root);
    const mounts = nonShippingMounts(root, manifest, entries, files);
    for (const f of files) {
      if (!mounts.has(f) && ships(f, manifest, entries)) console.log(f);
    }
    return;
  }

  const result = checkPortability(root, manifest);
  const { files, shipping } = result;
  const baseline = loadBaseline(root);
  const { above, stale } = ratchet([...result.violations, ...result.tableReads], baseline);

  if (stale.length > 0) {
    for (const k of stale) console.error(`no longer a violation: ${k}`);
    console.error(
      `\ncheck-portability: ${stale.length} stale baseline entr(ies). Remove them from ` +
        `${BASELINE_FILE} — the baseline may only shrink.`,
    );
    process.exit(1);
  }

  if (above.length > 0) {
    const violations = above;
    if (explain) {
      const byTarget = new Map();
      for (const v of violations) {
        const list = byTarget.get(v.target) ?? [];
        list.push(v.importer);
        byTarget.set(v.target, list);
      }
      for (const [target, importers] of [...byTarget].sort((a, b) => b[1].length - a[1].length)) {
        console.error(`${target}  (${violations.find((v) => v.target === target).reason})`);
        for (const i of importers) console.error(`    <- ${i}`);
      }
    } else {
      for (const v of violations.slice(0, 40)) {
        console.error(`${v.importer} -> ${v.target}  (${v.reason})`);
      }
      if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
    }
    const tables = violations.filter((v) => v.target.startsWith("table ")).length;
    if (violations.length > tables) {
      console.error(
        `\ncheck-portability: ${violations.length - tables} NEW import(s) from shipping code into code that does ` +
          `not ship. The fork would not build. Either move the imported piece somewhere portable ` +
          `(the kernel, or the entity's non-internal half), invert the dependency so the internal ` +
          `side calls the portable one, or mark the importer internal too in ` +
          `entities.manifest.json. Run with --explain to group by target. See the header of ` +
          `scripts/check-portability.mjs.`,
      );
    }
    if (tables > 0) {
      console.error(
        `\ncheck-portability: ${tables} NEW read(s) from shipping code of a table an internal entity owns. ` +
          `The fork's database will not have it (ADR 0031). Move the read behind a slot the internal ` +
          `entity provides, or mark the reader internal in entities.manifest.json.`,
      );
    }
    process.exit(1);
  }
  const held = baseline.size > 0 ? `, ${baseline.size} held by the baseline` : "";
  console.log(
    `check-portability: ${shipping} of ${files} source files ship to the fork; no new import ` +
      `reaches code that does not, and no new read reaches an internal table${held}.`,
  );
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
