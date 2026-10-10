// Fails when an entity's door graph imports a door it has not declared, when
// the declarations contain a cycle, or when a portable entity requires an
// internal one. Replaces check-entity-layers (RS-15, spec §P4, docs/adr/0004).
//
// The old gate gave each entity a hand-written `layer` and allowed a door
// import only into a strictly lower number. That worked while the graph was
// shallow, but a number says nothing about *what* an entity needs, and every
// new entity meant renumbering its neighbours. Worse, the number could not be
// checked against reality: an entity could declare layer 5 and import nothing.
//
// Now each entity declares `requires: [...]` — the entities it actually reaches
// through their doors. The order is derived from that as the longest chain to
// an entity that requires nothing, so nobody maintains it, and the gate fails
// on three things a number could not express:
//
//   undeclared  a door graph reaches a door the entity does not require, so
//               the catalogue understates what a deployment must install
//   unused      an entity declares a requirement it never reaches, so the
//               catalogue overstates it and a deployment installs dead weight
//   cycle       two entities require each other, so neither can be installed
//               without the other and neither is a unit of installation
//
// It also carries the distribution rule from ADR 0001: a portable entity may
// not require an internal one, because the port would not build.
//
// The mandatory set is exempt from declaration: every deployment has it, so
// requiring it says nothing. `contacts` is the only member today.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest, entityOf, ownershipEntries, KERNEL } from "./entity-manifest.mjs";
import { valueSpecifiers, resolveLocal } from "./check-entity-layers-walk.mjs";

const DOORS = ["index.ts", "client.ts", "upstream.ts"];

/** Entities every deployment installs, so requiring them is not worth stating. */
export const MANDATORY = ["contacts"];

/**
 * Portable-requires-internal pairs that are known and accepted, with the reason.
 * The rule they bend is ADR 0001's: a portable entity may not require an
 * internal one, because the port would not build. An entry here says the
 * contradiction is real, understood, and waiting on a decision rather than
 * hidden — the same discipline as scripts/action-auth-allowlist.json.
 *
 * Empty it by making the internal entity portable, or by moving the piece the
 * portable one needs. Neither is free: see the note on each entry.
 */
export const PORTABILITY_EXCEPTIONS = [
  {
    from: "portal",
    to: "htt",
    reason:
      "The client portal's Human Tokens band reads the Human Token Tracker, which is Edge8's own. " +
      "Moving the read into portal trades an import edge for a table read the ownership ratchet " +
      "will not raise, so the fix is a product decision: either the tracker ships with the product " +
      "(mark htt portable) or the band is an Edge8 overlay on the portal and comes out of it.",
  },
];

function isDoor(rel, manifest) {
  return Object.values(manifest.entities).some((e) => DOORS.some((d) => rel === `${e.target}/${d}`));
}

/**
 * Every door another entity's door graph actually reaches, per entity:
 * { [name]: Set<name> }. This is the measured graph, against which the
 * declared one is checked.
 */
export function reachedDoors(root, manifest, entries = ownershipEntries(manifest)) {
  const reached = {};
  for (const name of Object.keys(manifest.entities)) {
    const entity = manifest.entities[name];
    const out = new Set();
    const visited = new Set();
    const stack = DOORS.map((d) => `${entity.target}/${d}`).filter((rel) => fs.existsSync(path.join(root, rel)));
    while (stack.length > 0) {
      const rel = stack.pop();
      if (visited.has(rel)) continue;
      visited.add(rel);
      const source = fs.readFileSync(path.join(root, rel), "utf8");
      for (const spec of valueSpecifiers(source)) {
        const next = resolveLocal(root, spec, rel);
        if (next === null) continue;
        const owner = entityOf(next, manifest, entries);
        if (owner === name) {
          if (!visited.has(next)) stack.push(next);
          continue;
        }
        if (owner === KERNEL || !(owner in manifest.entities)) continue;
        if (isDoor(next, manifest)) out.add(owner);
      }
    }
    reached[name] = out;
  }
  return reached;
}

/**
 * Longest chain to an entity that requires nothing. Throws naming the cycle if
 * the declarations are not a DAG, because a derived order needs one.
 */
export function layersOf(manifest) {
  const req = Object.fromEntries(
    Object.entries(manifest.entities).map(([n, e]) => [n, (e.requires ?? []).filter((r) => r in manifest.entities)]),
  );
  const memo = {};
  const onPath = [];
  const walk = (n) => {
    if (memo[n] != null) return memo[n];
    const at = onPath.indexOf(n);
    if (at !== -1) throw new Error(`entities.manifest.json: requires cycle ${[...onPath.slice(at), n].join(" -> ")}`);
    onPath.push(n);
    const l = 1 + Math.max(0, ...req[n].map(walk));
    onPath.pop();
    return (memo[n] = l);
  };
  for (const n of Object.keys(req)) walk(n);
  return memo;
}

export function checkRequires(root, manifest = loadManifest(root)) {
  const problems = [];
  const reached = reachedDoors(root, manifest);
  let layers = {};
  try {
    layers = layersOf(manifest);
  } catch (err) {
    problems.push(err.message);
  }
  for (const [name, entity] of Object.entries(manifest.entities)) {
    const declared = new Set(entity.requires ?? []);
    for (const r of declared) {
      if (!(r in manifest.entities)) problems.push(`${name} requires "${r}", which is not an entity`);
      if (r === name) problems.push(`${name} requires itself`);
    }
    for (const to of reached[name] ?? []) {
      if (MANDATORY.includes(to) || declared.has(to)) continue;
      problems.push(`${name} reaches ${to}'s door but does not require it — add "${to}" to entities.${name}.requires`);
    }
    for (const r of declared) {
      if (!(reached[name] ?? new Set()).has(r) && !MANDATORY.includes(r)) {
        problems.push(`${name} requires ${r} but never reaches its door — drop it from entities.${name}.requires`);
      }
      // ADR 0001: the port has to build, so nothing portable may need something
      // that never leaves this repository.
      const mine = entity.portability;
      const theirs = manifest.entities[r]?.portability;
      const excused = PORTABILITY_EXCEPTIONS.some((e) => e.from === name && e.to === r);
      if (mine === "portable" && theirs === "internal" && !excused) {
        problems.push(`${name} is portable but requires ${r}, which is internal — the port would not build`);
      }
    }
  }
  return { problems, layers, reached };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const manifest = loadManifest(root);

  if (process.argv.includes("--write-requires")) {
    const reached = reachedDoors(root, manifest);
    for (const [name, entity] of Object.entries(manifest.entities)) {
      entity.requires = [...(reached[name] ?? [])].filter((r) => !MANDATORY.includes(r)).sort();
      delete entity.layer;
    }
    fs.writeFileSync(path.join(root, "entities.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("check-requires: wrote requires for every entity from the measured door graph.");
    return;
  }

  const { problems, layers } = checkRequires(root, manifest);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    console.error(
      `\ncheck-requires: ${problems.length} problem(s). An entity declares the entities its door ` +
        `graph reaches; the install order is derived from that. See the header of scripts/check-requires.mjs.`,
    );
    process.exit(1);
  }
  const depth = Math.max(0, ...Object.values(layers));
  console.log(
    `check-requires: ${Object.keys(layers).length} entities, every door import declared, ` +
      `no cycle, install order ${depth} deep.`,
  );
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
