import { describe, expect, it } from "vitest";

import { resolveAccess, type RolePermission } from "@/kernel/identity/access-model";

// The rule ADR 0013 rests on: what a person may do is the union of their roles'
// permissions, each reaching as far as its scope and their relationships allow,
// and no role ever takes anything away. These cases are that rule, row by row.

const ME = "p-me";
const rel = { personId: ME, reportIds: ["p-ana", "p-bao"], clientIds: ["c-acme"] };

const perms: RolePermission[] = [
  { role: "team-member", permission: "surface.team", scope: "all" },
  { role: "team-member", permission: "time-off.view", scope: "own" },
  { role: "manager", permission: "time-off.view", scope: "team" },
  { role: "manager", permission: "time-off.approve", scope: "team" },
  { role: "admin", permission: "time-off.view", scope: "all" },
  { role: "finance", permission: "crm.deals", scope: "clients" },
];

const as = (...roles: string[]) =>
  resolveAccess(
    roles.map((role) => ({ role, because: `test: ${role}` })),
    perms,
    rel,
  );

describe("resolveAccess", () => {
  it("grants nothing to someone with no role", () => {
    const access = as();
    expect(access.may("surface.team")).toBe(false);
    expect(access.permissions()).toEqual([]);
  });

  it("grants a permission only through a role that holds it", () => {
    const access = as("team-member");
    expect(access.may("surface.team")).toBe(true);
    expect(access.may("time-off.approve")).toBe(false);
  });

  it("reaches only the person themselves at scope own", () => {
    const access = as("team-member");
    expect(access.may("time-off.view", { person: ME })).toBe(true);
    expect(access.may("time-off.view", { person: "p-ana" })).toBe(false);
  });

  it("reaches the person and their reports at scope team", () => {
    const access = as("manager");
    expect(access.may("time-off.approve", { person: "p-ana" })).toBe(true);
    expect(access.may("time-off.approve", { person: ME })).toBe(true);
    expect(access.may("time-off.approve", { person: "p-stranger" })).toBe(false);
  });

  it("reaches the companies a person is assigned to at scope clients, and nothing else", () => {
    const access = as("finance");
    expect(access.may("crm.deals", { company: "c-acme" })).toBe(true);
    expect(access.may("crm.deals", { company: "c-other" })).toBe(false);
    expect(access.may("crm.deals", { person: "p-ana" })).toBe(false);
  });

  it("reaches everyone and every company at scope all", () => {
    const access = as("admin");
    expect(access.may("time-off.view", { person: "p-stranger" })).toBe(true);
    expect(access.may("time-off.view", { company: "c-other" })).toBe(true);
  });

  it("takes the union across roles, so the widest scope wins and nothing is subtracted", () => {
    // own (team member) + team (manager) + all (admin) on one permission is all.
    const access = as("team-member", "manager", "admin");
    expect(access.may("time-off.view", { person: "p-stranger" })).toBe(true);
    // Holding the narrower role as well never narrows what the wider one gave.
    expect(as("admin", "team-member").may("time-off.view", { person: "p-stranger" })).toBe(true);
  });

  it("unions team and own reach without widening to strangers", () => {
    const access = as("team-member", "manager");
    expect(access.may("time-off.view", { person: "p-bao" })).toBe(true);
    expect(access.may("time-off.view", { person: "p-stranger" })).toBe(false);
  });

  it("refuses a permission nobody declared, whatever the roles", () => {
    expect(as("team-member", "manager", "admin", "finance").may("finance.export")).toBe(false);
  });

  it("says why it holds each role, which is what the access screen shows", () => {
    expect(as("manager").roles).toEqual([{ role: "manager", because: "test: manager" }]);
  });

  it("lists each permission once, with the reach it ended up with", () => {
    const access = as("team-member", "manager");
    expect(access.permissions()).toEqual(["surface.team", "time-off.approve", "time-off.view"]);
  });

  it("ignores a role it holds twice rather than double-counting it", () => {
    const twice = resolveAccess(
      [
        { role: "manager", because: "3 people report to her" },
        { role: "manager", because: "granted by Dave: covering" },
      ],
      perms,
      rel,
    );
    expect(twice.may("time-off.approve", { person: "p-ana" })).toBe(true);
    expect(twice.roles).toHaveLength(2);
  });
});

// AE.1: an atom that differs between seeing and controlling comes as a pair,
// `<entity>.<thing>.view` and `<entity>.<thing>.manage`, and holding manage
// reaches view too, so a role lists one atom and gets both.
describe("view and manage pairs", () => {
  const pairs: RolePermission[] = [
    { role: "marketing-manager", permission: "marketing.campaigns.manage", scope: "all" },
    { role: "viewer", permission: "marketing.campaigns.view", scope: "all" },
    { role: "lead", permission: "people.reviews.manage", scope: "team" },
  ];
  const holding = (...roles: string[]) =>
    resolveAccess(
      roles.map((role) => ({ role, because: `test: ${role}` })),
      pairs,
      rel,
    );

  it("lets a holder of manage view as well", () => {
    const access = holding("marketing-manager");
    expect(access.may("marketing.campaigns.manage")).toBe(true);
    expect(access.may("marketing.campaigns.view")).toBe(true);
    expect(access.permissions()).toEqual(["marketing.campaigns.manage", "marketing.campaigns.view"]);
  });

  it("never lets a holder of view manage", () => {
    const access = holding("viewer");
    expect(access.may("marketing.campaigns.view")).toBe(true);
    expect(access.may("marketing.campaigns.manage")).toBe(false);
  });

  it("gives view the reach manage has, and no wider", () => {
    const access = holding("lead");
    expect(access.may("people.reviews.view", { person: "p-ana" })).toBe(true);
    expect(access.may("people.reviews.view", { person: "p-stranger" })).toBe(false);
  });

  it("adds the reaches of view and manage when a person holds both through different roles", () => {
    const access = resolveAccess(
      [
        { role: "lead", because: "t" },
        { role: "viewer", because: "t" },
      ],
      [...pairs, { role: "viewer", permission: "people.reviews.view", scope: "own" }],
      rel,
    );
    expect(access.may("people.reviews.view", { person: "p-bao" })).toBe(true);
    expect(access.may("people.reviews.view", { person: ME })).toBe(true);
  });

  it("leaves a two-part atom that merely ends in manage alone: only a declared pair implies", () => {
    const access = resolveAccess([{ role: "x", because: "t" }], [{ role: "x", permission: "access.manage", scope: "all" }], rel);
    expect(access.permissions()).toEqual(["access.manage"]);
  });
});
