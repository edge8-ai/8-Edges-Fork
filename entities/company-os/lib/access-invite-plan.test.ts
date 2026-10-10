import { describe, expect, it } from "vitest";
import {
  atomLabel,
  atomSides,
  mergeBundleOptions,
  moduleLabel,
  bundleOptions,
  invitePlan,
  NOTHING_CHOSEN_REFUSAL,
  NOTHING_OPENS,
  shapeAtoms,
  shapeGroups,
  SUPER_ADMIN_REFUSAL,
  type InviteChoice,
  type InviteFacts,
} from "./access-invite-plan";

// AE.4. The drawer's "What will happen" box and Send read the same plan, so
// what the box promises and what Send refuses are tested once, here.
const facts = (over: Partial<InviteFacts> = {}): InviteFacts => ({
  person: null,
  bundles: {
    accountant: { name: "Accountant", atoms: ["surface.admin", "finance.invoices"], seeded: true },
    admin: { name: "Admin", atoms: ["surface.admin", "boards.open"], seeded: true },
    "super-admin": { name: "Super Admin", atoms: ["access.manage"], seeded: true },
  },
  adminSide: new Set(["surface.admin", "finance.invoices", "crm.pipeline"]),
  teamSide: new Set(["surface.team", "coaching.mine"]),
  inviterName: "Sam",
  linkLifetimeHours: 24,
  heldRoleKeys: new Set(),
  customNameTaken: false,
  ...over,
});
const choice = (over: Partial<InviteChoice> = {}): InviteChoice => ({
  fullName: "Ana Lee",
  employmentType: "contract",
  roleKeys: [],
  customAtoms: [],
  ...over,
});

describe("invitePlan", () => {
  it("creates the person, adds a contractor with the Contractor baseline, grants each role and lands on the Admin view", () => {
    const plan = invitePlan(choice({ roleKeys: ["accountant"] }), facts());
    expect(plan.refusal).toBeNull();
    expect(plan.landing).toBe("admin");
    expect(plan.steps).toEqual([
      "Create Ana Lee in People (source: access invite).",
      "Add them to the team as Contractor, which gives the Contractor baseline.",
      "Grant Accountant.",
      "Email them an invitation from Sam to set a password; the link works for 24 hours.",
      "They land on the Admin view.",
    ]);
  });

  it("reuses an existing person, keeps their team type, and sends a sign-in link to an existing login", () => {
    const plan = invitePlan(
      choice({ employmentType: "temp" }),
      facts({ person: { name: "Bo Tran", employmentType: "full_time", login: "signed-in" } }),
    );
    expect(plan.refusal).toBeNull();
    expect(plan.landing).toBe("team");
    expect(plan.steps[0]).toBe("Reuse Bo Tran's record in People.");
    expect(plan.steps[1]).toMatch(/Already on the team as Full-time.*leaves the type/);
    expect(plan.steps).toContain("Email them a sign-in link from Sam: they already have a login.");
  });

  it("refuses Super Admin for a contractor", () => {
    expect(invitePlan(choice({ roleKeys: ["admin", "super-admin"] }), facts()).refusal).toBe(SUPER_ADMIN_REFUSAL);
    expect(invitePlan(choice({ employmentType: "intern", roleKeys: ["super-admin"] }), facts()).refusal).toBeNull();
  });

  it("refuses a temp or advisor with nothing chosen, and says nothing opens", () => {
    const plan = invitePlan(choice({ employmentType: "advisor" }), facts());
    expect(plan.refusal).toBe(NOTHING_CHOSEN_REFUSAL);
    expect(plan.landing).toBeNull();
    expect(plan.steps).toContain(NOTHING_OPENS);
  });

  it("builds a temp's custom shape as a one-person role with the surface it needs", () => {
    const plan = invitePlan(choice({ employmentType: "temp", customAtoms: ["crm.pipeline"] }), facts());
    expect(plan.refusal).toBeNull();
    expect(plan.customRoleName).toBe("Ana Lee (Temp)");
    expect(plan.customAtoms).toEqual(["crm.pipeline", "surface.admin"]);
    expect(plan.landing).toBe("admin");
    expect(plan.steps).toContain('Create the one-person role "Ana Lee (Temp)" holding 2 permissions, and grant it.');
  });

  it("adds surface.team to a Team-only custom shape", () => {
    const plan = invitePlan(choice({ employmentType: "advisor", customAtoms: ["coaching.mine"] }), facts());
    expect(plan.customAtoms).toEqual(["coaching.mine", "surface.team"]);
    expect(plan.landing).toBe("team");
  });

  it("refuses, before Send writes, what the grant helper would refuse after: a role already held, a taken custom name; Admin goes to a contractor", () => {
    expect(invitePlan(choice({ roleKeys: ["admin"] }), facts()).refusal).toBeNull();
    for (const t of ["temp", "advisor"] as const) expect(invitePlan(choice({ employmentType: t, roleKeys: ["super-admin"] }), facts()).refusal).toBe(SUPER_ADMIN_REFUSAL);
    const held = facts({ person: { name: "Bo Tran", employmentType: "contract", login: "invited" }, heldRoleKeys: new Set(["accountant"]) });
    expect(invitePlan(choice({ roleKeys: ["accountant"] }), held).refusal).toBe("Bo Tran already holds Accountant; untick it.");
    const taken = facts({ customNameTaken: true });
    expect(invitePlan(choice({ employmentType: "temp", customAtoms: ["crm.pipeline"] }), taken).refusal).toMatch(/already exists/);
  });

  it("refuses a custom shape for a type with a baseline, an undeclared role, and a bundle not yet seeded", () => {
    expect(invitePlan(choice({ customAtoms: ["crm.pipeline"] }), facts()).refusal).toMatch(/only for a temp or advisor/);
    expect(invitePlan(choice({ roleKeys: ["wizard"] }), facts()).refusal).toBe("No role called wizard can be granted.");
    const unseeded = facts({ bundles: { accountant: { name: "Accountant", atoms: ["surface.admin"], seeded: false } } });
    expect(invitePlan(choice({ roleKeys: ["accountant"] }), unseeded).refusal).toMatch(/access:sync/);
  });
});

describe("the registry shapes the drawer offers", () => {
  const registry = {
    atoms: {
      "surface.admin": { owner: "kernel", sentence: "Enter", holders: [] },
      "reimbursements.view": { owner: "reimbursements", sentence: "See claims", holders: [] },
      "reimbursements.manage": { owner: "reimbursements", sentence: "Run claims", holders: [] },
      "people.pay": { owner: "people", sentence: "See pay", holders: [] },
    },
    routes: { "/admin/reimbursements": "reimbursements.view", "/team/pay": "people.pay", "/admin/pay": "people.pay" },
    actions: {},
    roles: {
      "super-admin": { owner: "kernel", name: "Super Admin", sentence: "s", locked: true, atoms: [{ permission: "access.manage", scope: "all" as const }] },
      accountant: { owner: "finance", name: "Accountant", sentence: "a", locked: false, atoms: [{ permission: "surface.admin", scope: "all" as const }] },
    },
  };

  it("lists declared bundles, the unlocked first, each saying which view it opens", () => {
    expect(bundleOptions(registry).map((b) => [b.key, b.owner, b.opens])).toEqual([
      ["accountant", "finance", "Opens the Admin view."],
      ["super-admin", "kernel", "Adds to the view their other roles open."],
    ]);
  });

  it("groups atoms by owner, folds a view/manage pair into one row, leaves out surfaces and warns on sensitive ones", () => {
    expect(shapeGroups(registry)).toEqual([
      { owner: "people", label: "People", rows: [{ key: "people.pay", label: "Pay", sentence: "See pay", pair: false, warning: expect.stringMatching(/Sensitive/) }] },
      { owner: "reimbursements", label: "Reimbursements", rows: [{ key: "reimbursements", label: "Reimbursements", sentence: "See claims", pair: true, warning: null }] },
    ]);
    expect(shapeAtoms({ reimbursements: "manage", "people.pay": "hold", "crm.pipeline": "off" })).toEqual(["people.pay", "reimbursements.manage"]);
  });

  it("merges live granted roles that exist only as rows after the declared bundles, Admin and Super Admin last", () => {
    const declared = bundleOptions(registry);
    const merged = mergeBundleOptions(
      declared,
      [
        { key: "accountant", name: "Accountant (row)", description: "row words", permissions: [] },
        { key: "revenue", name: "Revenue", description: "Works the pipeline.", permissions: ["reimbursements.view"] },
        { key: "company", name: "Company", description: "Reads the company pages.", permissions: ["coaching.sessions"] },
      ],
      new Set(["reimbursements.view"]),
    );
    expect(merged.map((b) => [b.key, b.owner, b.sentence, b.opens])).toEqual([
      ["accountant", "finance", "a", "Opens the Admin view."],
      ["company", "granted", "Reads the company pages.", "Adds to the view their other roles open."],
      ["revenue", "granted", "Works the pipeline.", "Opens the Admin view."],
      ["super-admin", "kernel", "s", "Adds to the view their other roles open."],
    ]);
  });

  it("names modules and atoms for people", () => {
    expect([moduleLabel("company-os"), moduleLabel("crm"), moduleLabel("kernel"), moduleLabel("time-off")]).toEqual(["Company OS", "CRM", "Kernel", "Time Off"]);
    expect([atomLabel("boards.open"), atomLabel("company-os.publish-editor"), atomLabel("reimbursements")]).toEqual(["Open", "Publish editor", "Reimbursements"]);
  });

  it("puts an atom an /admin page needs on the Admin side, with its manage pair", () => {
    const sides = atomSides(registry);
    expect([...sides.adminSide].sort()).toEqual(["people.pay", "reimbursements.manage", "reimbursements.view"]);
    expect([...sides.teamSide]).toEqual([]);
  });
});
