// Generates the ESLint boundary zones from entities.manifest.json.
//
// Output is eslint.entities.mjs, a flat-config module that eslint.config.mjs
// spreads into its config array (B.18.1). It carries the whole
// `import/no-restricted-paths` rule: the entity zones from
// docs/engineering/2026-09-03-multi-entity-design.md §3. (The two legacy
// layering zones for lib/ and components/, and the AR-36 carve-out for shared
// components calling route actions, went with those directories in ME-13.)
//
//   1. app/ imports an entity only through its index.ts, client.ts, routes/, api/, crons/.
//   2. An entity imports another entity only through that entity's index.ts or client.ts.
//   3. kernel/ imports neither entities/ nor app/; entities/ never import app/.
//   4. A module inside an entity imports a sibling module only through its index.ts.
//
// `from` entries are plain directories, not globs, so `except` is a list of
// subpaths relative to each `from` — the documented form that does not trip
// over dot-directories the way absolute globs do (see the note that used to
// live beside the rule in the old .eslintrc.json). Zones for directories that do not
// exist yet are harmless: the rule never matches them until a move lands.
//
// `--check` (the CI step) regenerates in memory and fails when the committed
// file differs, so a manifest edit cannot land without its zones.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { entityNames, loadManifest } from "./entity-manifest.mjs";

export const ZONES_FILE = "eslint.entities.mjs";

// The two doors of an entity (design §3, "two doors per entity", ME-13): the
// index is the server barrel, client.ts the browser-safe one. Both are admitted
// wherever the index is, so a "use client" component has a sanctioned path in
// that never bundles the server side.
const DOORS = ["./index.ts", "./client.ts", "./upstream.ts"];

/** The zones array for `manifest`. */
export function buildZones(manifest) {
  const names = entityNames(manifest);
  const dirOf = (name) => `./${manifest.entities[name].target}`;
  // Every entity target shares one parent (entities/); the direction zones use it
  // rather than a literal so a relocated target cannot silently escape them.
  const entitiesRoot = `./${path.posix.dirname(manifest.entities[names[0]].target)}`;
  const zones = [];

  // 1. app/ composes entities through their public surface only.
  zones.push({
    target: "./app",
    from: names.map(dirOf),
    except: [...DOORS, "./routes", "./api", "./crons"],
    message:
      "app/ composes entities through their index.ts, client.ts, routes/, api/ and crons/ only. Export what the route needs from the entity's index (or client.ts for a client component).",
  });

  // 2. Entities see each other through the index only.
  for (const name of names) {
    const others = names.filter((n) => n !== name).map(dirOf);
    zones.push({
      target: dirOf(name),
      from: others,
      except: DOORS,
      message: `entities/${name} may import another entity only through that entity's index.ts or client.ts.`,
    });
  }

  // 3. Dependency direction: app → entities → kernel.
  zones.push({
    target: `./${manifest.kernel.target}`,
    from: [entitiesRoot, "./app"],
    message: "kernel/ is shared by every entity and must not depend on entities/ or app/.",
  });
  zones.push({
    target: entitiesRoot,
    from: ["./app"],
    message: "entities/ never import route code under app/; app/ is a thin composer.",
  });

  // 5. Route code is the leaf of an entity. A page composes the entity's
  // modules, lib and ui; the reverse — a module's UI importing a server
  // action that lives under routes/ — inverts the direction and puts the
  // entity's write API in a folder the layer gate deliberately ignores. The
  // 2026-09-06 audit found 43 such edges; Wave 3 moved every action a module
  // or shared component needs into the module or lib that owns its data.
  for (const name of names) {
    const dir = dirOf(name);
    zones.push({
      target: [`${dir}/modules`, `${dir}/ui`, `${dir}/lib`],
      from: [`${dir}/routes`, `${dir}/api`, `${dir}/crons`],
      message: `entities/${name}/{modules,ui,lib} may not import route code; move the action into the module or lib that owns its data.`,
    });
  }

  // 4. Sibling modules inside an entity go through each other's index.
  for (const name of names) {
    const modules = manifest.entities[name].modules ?? [];
    for (const m of modules) {
      const siblings = modules.filter((s) => s !== m).map((s) => `${dirOf(name)}/modules/${s}`);
      if (siblings.length === 0) continue;
      zones.push({
        target: `${dirOf(name)}/modules/${m}`,
        from: siblings,
        except: ["./index.ts"],
        message: `entities/${name}/modules/${m} may import a sibling module only through its index.ts.`,
      });
    }
  }
  return zones;
}

export function renderZonesFile(manifest) {
  // A flat-config object, not an array, so eslint.config.mjs places it where the
  // old `extends` entry stood. It names no plugin: the import plugin is
  // registered once by the Next preset, and flat config refuses a plugin
  // registered twice from two different objects.
  const config = { rules: { "import/no-restricted-paths": ["error", { zones: buildZones(manifest) }] } };
  return (
    "// GENERATED by scripts/gen-entity-zones.mjs from entities.manifest.json — do not edit;\n" +
    "// run `npm run gen:entity-zones` after changing the manifest.\n" +
    `const entityZones = ${JSON.stringify(config, null, 2)};\n\nexport default entityZones;\n`
  );
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const file = path.join(root, ZONES_FILE);
  const rendered = renderZonesFile(loadManifest(root));

  if (process.argv.includes("--check")) {
    const committed = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (committed !== rendered) {
      console.error(
        `gen-entity-zones: ${ZONES_FILE} is stale against entities.manifest.json. ` +
          "Run `npm run gen:entity-zones` and commit the result.",
      );
      process.exit(1);
    }
    console.log(`gen-entity-zones: ${ZONES_FILE} matches the manifest.`);
    return;
  }
  fs.writeFileSync(file, rendered);
  console.log(`gen-entity-zones: wrote ${ZONES_FILE}.`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
