// access:sync (ADR 0013, AC.4): the declared default holders of every
// permission, as rows of company_os.access_role_permissions.
//
// Each entity names, in its `permissions.ts`, which roles hold each of its
// atoms on a fresh install and at which scope. This script compares those
// defaults with what the database has and plans the rows that are missing. A
// pair is planned only the first time it is ever seen: a live pair is left
// alone whatever its scope, and a revoked pair is never added back, because
// someone revoked it on purpose in Settings → Access. A holder naming a role
// the database does not have, or an archived one, is reported and skipped.
//
// Role bundles (AE.2) follow the same rule one level up. A role an entity or
// the kernel declares in its `roles` section is seeded the first time its key
// is seen: a granted role row with the declared name and sentence, carrying the
// bundle's atoms and any holders entry naming it. A role that exists, live or
// archived, is never touched; the Access screen edits it from then on, so the
// declaration is the starting shape and the database stays the truth.
// `--fresh` plans against an empty register without reading any database,
// which is what a new deployment's first sync would write.
//
// It never writes. `npm run access:sync` prints the plan; `-- --sql-out <file>`
// also writes the insert, which is a write to access configuration and so is run
// only after a human has said yes to it (CLAUDE.md, "Risky SQL"), with
// `supabase db query --linked -f <file>`. The insert names every row and cannot
// duplicate a live pair.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { closureOf, loadDeployments } from "./check-deployment.mjs";
import { permissionsModel } from "./gen-deployment.mjs";
import { companyOsClient } from "./board/lib.mjs";

/**
 * The rows to insert, given the registry's atoms ({ key: { holders } }), the
 * roles ({ id, key, archived_at }) and every pair ever written
 * ({ role_id, permission, scope, revoked_at }), live or revoked.
 */
export function planSync({ atoms, roles, pairs, bundles = [] }) {
  const byKey = new Map(roles.map((r) => [r.key, r]));
  const seen = new Map(pairs.map((p) => [`${p.role_id} ${p.permission}`, p]));
  const plan = { inserts: [], roleSeeds: [], revokedKept: [], unknownRoles: [], archivedRoles: [] };

  // A declared bundle whose key the database has never had, archived or not, is
  // seeded whole: the role row and every pair. One that exists is the Access
  // screen's from then on, so nothing here adds to it or changes it.
  const seeds = new Map();
  for (const b of [...bundles].sort((x, y) => (x.key < y.key ? -1 : 1))) {
    if (byKey.has(b.key)) continue;
    seeds.set(b.key, { key: b.key, name: b.name, description: b.sentence, pairs: new Map(b.atoms.map((a) => [a.permission, a.scope])) });
  }

  for (const permission of Object.keys(atoms).sort()) {
    for (const { role, scope } of atoms[permission].holders) {
      const seed = seeds.get(role);
      if (seed) {
        // The bundle's own scope wins where both name the atom.
        if (!seed.pairs.has(permission)) seed.pairs.set(permission, scope);
        continue;
      }
      const r = byKey.get(role);
      if (!r) {
        plan.unknownRoles.push({ role, permission });
        continue;
      }
      if (r.archived_at) {
        plan.archivedRoles.push({ role, permission });
        continue;
      }
      const prior = seen.get(`${r.id} ${permission}`);
      if (prior?.revoked_at) plan.revokedKept.push({ role, permission });
      if (prior) continue;
      plan.inserts.push({ roleId: r.id, role, permission, scope });
    }
  }
  plan.roleSeeds = [...seeds.values()].map((s) => ({
    key: s.key,
    name: s.name,
    description: s.description,
    pairs: [...s.pairs].sort(([a], [b]) => (a < b ? -1 : 1)).map(([permission, scope]) => ({ permission, scope })),
  }));
  return plan;
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * One role seed as a single statement: the role row, then its pairs keyed on
 * the id that insert returns. When the key exists by the time it runs, the
 * role insert returns nothing and so no pair is written: a role that exists is
 * never touched.
 */
function renderSeed(seed) {
  const values = seed.pairs.map((p) => `  (${lit(p.permission)}, ${lit(p.scope)})`).join(",\n");
  return `-- Seed the declared role ${seed.key} (AE.2), only if no role has that key.
with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values (${lit(seed.key)}, ${lit(seed.name)}, ${lit(seed.description)}, 'granted')
  on conflict (key) do nothing
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, v.permission, v.scope
from seeded, (values
${values}
) as v (permission, scope)
on conflict do nothing
returning role_id, permission, scope;
`;
}

/** The SQL for a plan's rows and role seeds, or "" when there is nothing to write. */
export function renderSyncSql(inserts, roleSeeds = []) {
  const parts = roleSeeds.map(renderSeed);
  if (inserts.length > 0) {
    const values = inserts.map((i) => `  (${lit(i.roleId)}::uuid, ${lit(i.permission)}, ${lit(i.scope)})`).join(",\n");
    parts.push(`-- access:sync: ${inserts.length} default holder row(s) from the declarations (ADR 0013).
-- Every row is named; a live pair cannot be duplicated (access_role_permissions_live_uniq).
insert into company_os.access_role_permissions (role_id, permission, scope) values
${values}
on conflict do nothing
returning role_id, permission, scope;
`);
  }
  return parts.join("\n");
}

/** The roles and every pair ever written, live or revoked, from the linked database. */
async function readRegister() {
  const db = companyOsClient();
  const [{ data: roles, error: rolesError }, { data: pairs, error: pairsError }] = await Promise.all([
    db.from("access_roles").select("id, key, archived_at"),
    db.from("access_role_permissions").select("role_id, permission, scope, revoked_at"),
  ]);
  // A failed read would plan every pair and role as new, so it stops the run instead.
  if (rolesError) throw new Error(`access-sync: reading access_roles failed: ${rolesError.message}`);
  if (pairsError) throw new Error(`access-sync: reading access_role_permissions failed: ${pairsError.message}`);
  return { roles, pairs };
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const manifest = loadManifest(root);
  const name = process.env.EDGE8_DEPLOYMENT ?? "edge8";
  const deployment = loadDeployments(root).find((d) => d.name === name);
  if (!deployment) throw new Error(`access-sync: no deployments/${name}.json`);
  const model = permissionsModel(root, manifest, closureOf(manifest, deployment.entities));
  const atoms = Object.fromEntries(model.atoms.map((a) => [a.key, { holders: a.holders }]));

  // --fresh plans against an empty register without reading any database: what
  // a new deployment or a fork's first sync would write.
  const fresh = process.argv.includes("--fresh");
  const { roles, pairs } = fresh ? { roles: [], pairs: [] } : await readRegister();

  const plan = planSync({ atoms, roles, pairs, bundles: model.roles });
  console.log(`access-sync: deployment ${name}${fresh ? ", planned against an empty register (--fresh)" : ""}.`);
  for (const s of plan.roleSeeds) {
    console.log(`  * seed role ${s.key} (${s.name}) with ${s.pairs.length} permission(s): ${s.pairs.map((p) => `${p.permission}${p.scope === "all" ? "" : `:${p.scope}`}`).join(", ")}`);
  }
  for (const l of model.leftOut) console.log(`  - role ${l.key} (${l.owner}) left out: needs ${l.missing.join(", ")}`);
  for (const i of plan.inserts) console.log(`  + ${i.role} holds ${i.permission} at ${i.scope}`);
  for (const k of plan.revokedKept) console.log(`  = ${k.role} / ${k.permission}: revoked on purpose, left revoked`);
  for (const u of plan.unknownRoles) console.error(`  ! ${u.permission} names role "${u.role}", which the database does not have`);
  for (const a of plan.archivedRoles) console.error(`  ! ${a.permission} names role "${a.role}", which is archived`);
  console.log(
    `access-sync: ${plan.roleSeeds.length} role(s) to seed, ${plan.inserts.length} to insert, ${plan.revokedKept.length} revoked and kept, ${plan.unknownRoles.length} unknown role(s).`,
  );

  const at = process.argv.indexOf("--sql-out");
  if (at > -1 && process.argv[at + 1]) {
    fs.writeFileSync(process.argv[at + 1], renderSyncSql(plan.inserts, plan.roleSeeds));
    console.log(`access-sync: wrote the insert to ${process.argv[at + 1]}; run it only after a human has said yes.`);
  }
  // On an empty register every implied role is "unknown": the access tables migration creates those, not the sync.
  if (plan.unknownRoles.length > 0 && !fresh) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();
