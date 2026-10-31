import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accessRowsOf, checkAccessRows, declaredPairs, parseAccessRowInserts } from "./check-access-rows.mjs";
import { isForkTree } from "./fork-tree.mjs";

// A declared default holder must reach company_os.access_role_permissions
// through a migration (ADR 0013). PR #2314 declared finance.pnl for Super Admin
// with no access-row migration, and the page refused every Super Admin.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pairs = (list) => list.map((p) => `${p.role} ${p.permission} ${p.scope}`).sort();

describe("parseAccessRowInserts", () => {
  it("reads a (role, atom, scope) values list", () => {
    const sql = `-- ('admin', 'not.this', 'all') in a comment is not a row
insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, v.scope
from (values
  ('super-admin', 'finance.pnl', 'all'),
  ('manager',     'team.reviews', 'team')
) as v (role_key, permission, scope)
join company_os.access_roles r on r.key = v.role_key and r.archived_at is null;`;
    expect(pairs(parseAccessRowInserts(sql))).toEqual(["manager team.reviews team", "super-admin finance.pnl all"]);
  });

  it("reads a (role, atom) list with the scope a literal in the select", () => {
    const sql = `insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'all'
from (values ('super-admin', 'org.legal-entities'), ('finance', 'org.legal-registration')) as v(role_key, permission)
join company_os.access_roles r on r.key = v.role_key;`;
    expect(pairs(parseAccessRowInserts(sql))).toEqual(["finance org.legal-registration all", "super-admin org.legal-entities all"]);
  });

  it("reads an (atom) list for the one role the where clause names", () => {
    const sql = `insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, v.permission, 'clients'
from company_os.access_roles r,
     (values ('client-programs.status'), ('client-programs.status-release')) as v(permission)
where r.key = 'client-team';`;
    expect(pairs(parseAccessRowInserts(sql))).toEqual([
      "client-team client-programs.status clients",
      "client-team client-programs.status-release clients",
    ]);
  });

  it("reads an (atom) list and a literal atom for a role the statement seeds", () => {
    const sql = `with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values ('hiring-approver', 'Hiring approver', 'Approves hires; and the candidate''s rejection.', 'granted')
  on conflict (key) do nothing
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, v.permission, 'all'
from seeded, (values ('surface.admin'), ('hiring.ats')) as v(permission);
with seeded as (
  insert into company_os.access_roles (key, name, description, kind)
  values ('revenue-approver', 'Revenue approver', 'Approves proposals.', 'granted')
  returning id
)
insert into company_os.access_role_permissions (role_id, permission, scope)
select seeded.id, 'crm.proposal-approve', 'all'
from seeded;`;
    // The ';' and the doubled quote in a description do not end the statement.
    expect(pairs(parseAccessRowInserts(sql))).toEqual([
      "hiring-approver hiring.ats all",
      "hiring-approver surface.admin all",
      "revenue-approver crm.proposal-approve all",
    ]);
  });

  it("reads a literal atom for a role named in the where clause", () => {
    const sql = `insert into company_os.access_role_permissions (role_id, permission, scope)
select r.id, 'team.assume', 'all'
from company_os.access_roles r
where r.key = 'super-admin';`;
    expect(pairs(parseAccessRowInserts(sql))).toEqual(["super-admin team.assume all"]);
  });

  it("ignores statements that do not insert access rows", () => {
    const sql = `update company_os.access_role_permissions p set revoked_at = now()
from company_os.access_roles r where r.key = 'accountant' and p.permission in ('reimbursements.check');
insert into company_os.access_roles (key, name) values ('finance', 'Finance');`;
    expect(parseAccessRowInserts(sql)).toEqual([]);
  });
});

describe("declaredPairs and checkAccessRows", () => {
  const declarations = [
    {
      file: "entities/finance/permissions.ts",
      holders: { "finance.pnl": "super-admin", "finance.invoices": "admin, revenue:team" },
      roles: { accountant: { atoms: "finance.invoices, boards.open:own" } },
    },
  ];

  it("names every holder and bundle grant with its scope", () => {
    expect(pairs(declaredPairs(declarations))).toEqual([
      "accountant boards.open own",
      "accountant finance.invoices all",
      "admin finance.invoices all",
      "revenue finance.invoices team",
      "super-admin finance.pnl all",
    ]);
  });

  it("fails a pair no migration grants, at the declared scope, unless allowlisted", () => {
    const declared = declaredPairs(declarations);
    const granted = [
      { role: "admin", permission: "finance.invoices", scope: "all" },
      { role: "revenue", permission: "finance.invoices", scope: "all" },
      { role: "accountant", permission: "finance.invoices", scope: "all" },
    ];
    const allowlist = [{ role: "accountant", permission: "boards.open", scope: "own", reason: "seeded by hand" }];
    const { missing, stale } = checkAccessRows({ declared, granted, allowlist });
    expect(pairs(missing)).toEqual(["revenue finance.invoices team", "super-admin finance.pnl all"]);
    expect(stale).toEqual([]);
  });

  it("calls an allowlist entry stale once a migration grants it or nothing declares it", () => {
    const declared = declaredPairs(declarations);
    const allowlist = [
      { role: "admin", permission: "finance.invoices", scope: "all", reason: "x" },
      { role: "admin", permission: "gone.atom", scope: "all", reason: "x" },
    ];
    const granted = [{ role: "admin", permission: "finance.invoices", scope: "all" }];
    expect(pairs(checkAccessRows({ declared, granted, allowlist }).stale)).toEqual(["admin finance.invoices all", "admin gone.atom all"]);
  });
});

// The public fork receives no migrations, and the gate itself says so and skips
// there (check-access-rows.mjs); these two read the migrations directly, so they
// skip in the fork too rather than fail a client's first check on a folder it
// was never sent.
describe.skipIf(isForkTree(ROOT))("the tree", () => {
  it("passes as committed", () => {
    const { missing, stale } = accessRowsOf(ROOT);
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("fails without the finance.pnl access-row migration (the PR #2314 incident)", () => {
    const { missing } = accessRowsOf(ROOT, { skipMigration: (f) => f === "20261024150000_finance_pnl_access_rows.sql" });
    expect(pairs(missing)).toEqual(["super-admin finance.pnl all"]);
  });
});
