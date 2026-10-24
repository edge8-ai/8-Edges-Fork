// Fails when a deployment file names an entity that does not exist, leaves out
// something an included entity requires, or drifts from the generated artefacts
// built from it (RS-16, spec §P4, docs/adr/0001).
//
// A deployment file is the whole of what makes one client's build different
// from another's: a list of entity names. Everything else about the build — for
// now the event-subscriber registry, and in time the app/ mounts, the cron
// schedule and the env schema — is derived from it, so turning an entity off is
// one line rather than a hunt.
//
// Closure is the rule that makes the list trustworthy. `requires` says what an
// entity's code actually reaches (check-requires proves it), so a deployment
// that includes an entity without what it requires would not compile. Rather
// than let that fail at build time in a client's CI, it fails here, naming the
// entity to add.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { MANDATORY } from "./check-requires.mjs";

export const DEPLOYMENTS_DIR = "deployments";

/** Every deployment file, as { name, entities, file }. */
export function loadDeployments(root) {
  const dir = path.join(root, DEPLOYMENTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return { file: `${DEPLOYMENTS_DIR}/${f}`, name: parsed.name ?? f.replace(/\.json$/, ""), entities: parsed.entities ?? [] };
    });
}

/**
 * The entities a deployment really installs: what it lists, plus the mandatory
 * set, plus everything those require, transitively.
 */
export function closureOf(manifest, names) {
  const out = new Set([...names, ...MANDATORY]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of [...out]) {
      for (const r of manifest.entities[n]?.requires ?? []) {
        if (!out.has(r)) {
          out.add(r);
          grew = true;
        }
      }
    }
  }
  return out;
}

export function checkDeployments(root, manifest = loadManifest(root)) {
  const problems = [];
  const deployments = loadDeployments(root);
  if (deployments.length === 0) problems.push(`${DEPLOYMENTS_DIR}/ has no deployment file`);
  for (const d of deployments) {
    if (!Array.isArray(d.entities) || d.entities.length === 0) {
      problems.push(`${d.file}: "entities" must be a non-empty array of entity names`);
      continue;
    }
    for (const n of d.entities) {
      if (!(n in manifest.entities)) problems.push(`${d.file}: "${n}" is not an entity in entities.manifest.json`);
    }
    const listed = new Set(d.entities);
    for (const n of closureOf(manifest, d.entities)) {
      if (!listed.has(n) && !MANDATORY.includes(n)) {
        const needs = d.entities.filter((e) => (manifest.entities[e]?.requires ?? []).includes(n));
        problems.push(
          `${d.file}: includes ${needs.join(", ")} but not ${n}, which ${needs.length > 1 ? "they require" : "it requires"} — add "${n}"`,
        );
      }
    }
    for (const n of d.entities) {
      if (d.entities.filter((x) => x === n).length > 1) problems.push(`${d.file}: "${n}" is listed twice`);
    }
  }
  // Edge8's own deployment is the catalogue: an entity nothing installs is an
  // entity nobody is building, and the repo should say so out loud.
  const edge8 = deployments.find((d) => d.name === "edge8");
  if (edge8) {
    for (const n of Object.keys(manifest.entities)) {
      if (!edge8.entities.includes(n)) problems.push(`deployments/edge8.json: the catalogue has ${n} but this deployment omits it`);
    }
  }
  return { problems, deployments };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const manifest = loadManifest(root);
  const { problems, deployments } = checkDeployments(root, manifest);
  if (problems.length > 0) {
    for (const line of problems) console.error(line);
    console.error(
      `\ncheck-deployment: ${problems.length} problem(s). A deployment lists the entities a build ` +
        `installs and must be closed under \`requires\`. See the header of scripts/check-deployment.mjs.`,
    );
    process.exit(1);
  }
  const sizes = deployments.map((d) => `${d.name} ${d.entities.length}`).join(", ");
  console.log(`check-deployment: ${deployments.length} deployment(s), each closed under requires (${sizes}).`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
