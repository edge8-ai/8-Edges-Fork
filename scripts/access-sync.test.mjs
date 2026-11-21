import { describe, expect, it } from "vitest";
import { planSync, renderSyncSql } from "./access-sync.mjs";

// access:sync turns each declared permission's default holders into
// access_role_permissions rows. The one rule that matters: a pair is written
// only the first time it is ever seen, so a pair someone revoked in Settings →
// Access is never added back, and a pair that exists is never touched.

const roles = [
  { id: "r-admin", key: "admin", archived_at: null },
  { id: "r-team", key: "team-member", archived_at: null },
  { id: "r-old", key: "retired", archived_at: "2026-10-01T00:00:00Z" },
];

const atoms = {
  "boards.open": { holders: [{ role: "admin", scope: "all" }] },
  "surface.team": { holders: [{ role: "team-member", scope: "all" }, { role: "contractor", scope: "all" }] },
  "time-off.view": { holders: [{ role: "team-member", scope: "own" }, { role: "retired", scope: "all" }] },
};

describe("planSync", () => {
  it("inserts every default pair the database has never seen", () => {
    const plan = planSync({ atoms, roles, pairs: [] });
    expect(plan.inserts).toEqual([
      { roleId: "r-admin", role: "admin", permission: "boards.open", scope: "all" },
      { roleId: "r-team", role: "team-member", permission: "surface.team", scope: "all" },
      { roleId: "r-team", role: "team-member", permission: "time-off.view", scope: "own" },
    ]);
  });

  it("leaves a live pair alone, whatever scope it now has", () => {
    const pairs = [{ role_id: "r-admin", permission: "boards.open", scope: "team", revoked_at: null }];
    expect(planSync({ atoms, roles, pairs }).inserts.map((i) => i.permission)).not.toContain("boards.open");
  });

  it("never re-adds a pair someone revoked, and says so", () => {
    const pairs = [{ role_id: "r-admin", permission: "boards.open", scope: "all", revoked_at: "2026-10-05T00:00:00Z" }];
    const plan = planSync({ atoms, roles, pairs });
    expect(plan.inserts.map((i) => i.permission)).not.toContain("boards.open");
    expect(plan.revokedKept).toEqual([{ role: "admin", permission: "boards.open" }]);
  });

  it("reports a holder naming a role the database does not have, rather than inventing it", () => {
    expect(planSync({ atoms, roles, pairs: [] }).unknownRoles).toEqual([{ role: "contractor", permission: "surface.team" }]);
  });

  it("does not grant through an archived role", () => {
    const plan = planSync({ atoms, roles, pairs: [] });
    expect(plan.inserts.some((i) => i.role === "retired")).toBe(false);
    expect(plan.archivedRoles).toEqual([{ role: "retired", permission: "time-off.view" }]);
  });

  it("is empty once everything is in place, so running it twice changes nothing", () => {
    const first = planSync({ atoms, roles, pairs: [] });
    const pairs = first.inserts.map((i) => ({ role_id: i.roleId, permission: i.permission, scope: i.scope, revoked_at: null }));
    expect(planSync({ atoms, roles, pairs }).inserts).toEqual([]);
  });
});

// AE.2: a declared role bundle is seeded the first time its key is seen, as a
// granted role carrying its atoms and whatever the holders give it, and a role
// that exists is never touched, whatever the declaration now says.
describe("planSync, role bundles", () => {
  const bundles = [
    {
      key: "accountant",
      name: "Accountant",
      sentence: "Pays approved claims.",
      atoms: [
        { permission: "surface.admin", scope: "all" },
        { permission: "boards.open", scope: "team" },
      ],
    },
    { key: "admin", name: "Admin", sentence: "Runs the Admin view.", atoms: [{ permission: "boards.open", scope: "all" }] },
  ];
  const withAccountantHolder = { ...atoms, "time-off.view": { holders: [{ role: "accountant", scope: "own" }] } };

  it("seeds a bundle the database has never seen, with its atoms and the holders that name it", () => {
    const plan = planSync({ atoms: withAccountantHolder, roles, pairs: [], bundles });
    expect(plan.roleSeeds).toEqual([
      {
        key: "accountant",
        name: "Accountant",
        description: "Pays approved claims.",
        pairs: [
          { permission: "boards.open", scope: "team" },
          { permission: "surface.admin", scope: "all" },
          { permission: "time-off.view", scope: "own" },
        ],
      },
    ]);
    // A holder naming the seeded role is part of the seed, not an unknown role.
    expect(plan.unknownRoles).not.toContainEqual({ role: "accountant", permission: "time-off.view" });
  });

  it("never touches a role that exists: no seed, and no bundle atom added to it", () => {
    const plan = planSync({ atoms, roles, pairs: [], bundles: [bundles[1]] });
    expect(plan.roleSeeds).toEqual([]);
    // Admin's own holders still add their first-seen pair, as before; the bundle adds nothing.
    expect(plan.inserts.filter((i) => i.role === "admin")).toEqual([
      { roleId: "r-admin", role: "admin", permission: "boards.open", scope: "all" },
    ]);
  });

  it("does not seed an archived role again", () => {
    const archived = [...roles, { id: "r-acc", key: "accountant", archived_at: "2026-10-01T00:00:00Z" }];
    expect(planSync({ atoms, roles: archived, pairs: [], bundles }).roleSeeds).toEqual([]);
  });

  it("seeds Admin and Super Admin on a fresh register, where no role exists yet", () => {
    const kernel = [
      bundles[1],
      { key: "super-admin", name: "Super Admin", sentence: "Sees pay.", atoms: [{ permission: "access.manage", scope: "all" }] },
    ];
    const plan = planSync({ atoms: {}, roles: [], pairs: [], bundles: kernel });
    expect(plan.roleSeeds.map((s) => s.key)).toEqual(["admin", "super-admin"]);
    expect(plan.unknownRoles).toEqual([]);
  });

  it("is empty for the bundle once the role exists, so running it twice changes nothing", () => {
    const seeded = [...roles, { id: "r-acc", key: "accountant", archived_at: null }];
    expect(planSync({ atoms, roles: seeded, pairs: [], bundles }).roleSeeds).toEqual([]);
  });
});

describe("renderSyncSql", () => {
  it("seeds a role and its pairs in one statement that does nothing when the key already exists", () => {
    const sql = renderSyncSql([], [
      { key: "accountant", name: "Accountant", description: "Pays the team's claims.", pairs: [{ permission: "boards.open", scope: "all" }, { permission: "reimbursements.claims.view", scope: "own" }] },
    ]);
    expect(sql).toContain("insert into company_os.access_roles (key, name, description, kind)");
    expect(sql).toContain("values ('accountant', 'Accountant', 'Pays the team''s claims.', 'granted')");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql).toContain("('boards.open', 'all')");
    expect(sql).toContain("('reimbursements.claims.view', 'own')");
    expect(sql).toMatch(/returning role_id, permission, scope;/);
  });

  it("writes only the pair insert when no role is seeded, as before", () => {
    const sql = renderSyncSql([{ roleId: "r-admin", role: "admin", permission: "boards.open", scope: "all" }], []);
    expect(sql).not.toContain("access_roles");
  });

  it("writes one insert that names its rows and cannot duplicate a live pair", () => {
    const sql = renderSyncSql([{ roleId: "r-admin", role: "admin", permission: "boards.open", scope: "all" }]);
    expect(sql).toContain("insert into company_os.access_role_permissions (role_id, permission, scope)");
    expect(sql).toContain("('r-admin'::uuid, 'boards.open', 'all')");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toMatch(/returning role_id, permission, scope;/);
  });

  it("writes nothing to run when there is nothing to insert", () => {
    expect(renderSyncSql([])).toBe("");
  });
});

// The real deployments: a fresh register is seeded with the kernel's Admin and
// Super Admin in both, each keeping only the atoms its deployment installs.
describe("the real deployments on a fresh register", async () => {
  const path = await import("node:path");
  const { loadManifest } = await import("./entity-manifest.mjs");
  const { closureOf, loadDeployments } = await import("./check-deployment.mjs");
  const { permissionsModel } = await import("./gen-deployment.mjs");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const manifest = loadManifest(root);
  const planFor = (name) => {
    const deployment = loadDeployments(root).find((d) => d.name === name);
    const model = permissionsModel(root, manifest, closureOf(manifest, deployment.entities));
    const atoms = Object.fromEntries(model.atoms.map((a) => [a.key, { holders: a.holders }]));
    return { model, plan: planSync({ atoms, roles: [], pairs: [], bundles: model.roles }) };
  };

  for (const name of ["minimal", "edge8"]) {
    it(`seeds Admin and Super Admin for ${name}, locked, with only installed atoms`, () => {
      const { model, plan } = planFor(name);
      const installed = new Set(model.atoms.map((a) => a.key));
      const keys = plan.roleSeeds.map((s) => s.key);
      expect(keys).toEqual(expect.arrayContaining(["admin", "super-admin"]));
      for (const r of model.roles.filter((x) => x.owner === "kernel")) expect(r.locked).toBe(true);
      for (const s of plan.roleSeeds) for (const p of s.pairs) expect(installed.has(p.permission)).toBe(true);
    });
  }

  it("gives minimal's Admin fewer atoms than edge8's, because minimal installs less", () => {
    const pairsOf = (name) => planFor(name).plan.roleSeeds.find((s) => s.key === "admin").pairs.map((p) => p.permission);
    const minimal = pairsOf("minimal");
    const edge8 = pairsOf("edge8");
    expect(minimal.length).toBeLessThan(edge8.length);
    expect(minimal).toContain("surface.admin");
    expect(minimal).not.toContain("retreats.manage");
    expect(edge8).toContain("retreats.manage");
    expect(minimal.every((p) => edge8.includes(p))).toBe(true);
  });
});
