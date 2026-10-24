import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Who holds a permission through a granted role (design §1.8): the recipients
// of a message about work that waits on a role, not on a person — the
// approvers told a claim was checked, the Monday nudge. Read from the
// registers Settings → Access writes, so a revoked pair, an archived role or
// a revoked grant reaches nobody.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { peopleHolding } from "./people-holding";

beforeEach(() => resetFake());

describe("peopleHolding", () => {
  it("answers each person with a live grant of a live role that carries the permission, once", async () => {
    script("access_role_permissions", { data: [{ role_id: "role-approver" }, { role_id: "role-employer" }, { role_id: "role-archived" }] });
    script("access_roles", { data: [{ id: "role-approver" }, { id: "role-employer" }] });
    script("access_role_assignments", { data: [{ person_id: "p-dave" }, { person_id: "p-mai" }, { person_id: "p-dave" }] });
    expect(await peopleHolding("reimbursements.approve")).toEqual(["p-dave", "p-mai"]);
    const filters = Object.fromEntries(calls.map((c) => [c.table, c.filters]));
    expect(filters.access_role_permissions).toEqual([
      ["eq", "permission", "reimbursements.approve"],
      ["is", "revoked_at", null],
    ]);
    expect(filters.access_roles).toEqual([
      ["in", "id", ["role-approver", "role-employer", "role-archived"]],
      ["is", "archived_at", null],
    ]);
    expect(filters.access_role_assignments).toEqual([
      ["in", "role_id", ["role-approver", "role-employer"]],
      ["is", "revoked_at", null],
    ]);
  });

  it("answers nobody, reading no further, when no role carries the permission", async () => {
    script("access_role_permissions", { data: [] });
    expect(await peopleHolding("reimbursements.approve")).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual(["access_role_permissions"]);
  });

  it("throws on a failed read rather than answering that nobody holds it", async () => {
    script("access_role_permissions", { data: null, error: { message: "db down" } });
    await expect(peopleHolding("reimbursements.approve")).rejects.toThrow();
  });
});
