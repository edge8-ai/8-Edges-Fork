import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.2.1. The inbox reads what waits on a person through waitingOn, unchanged,
// and adds the words around each row: who asked, whose decision it is, the
// tier, and a link only to a page the viewer may open (ADR 0013).
const waitingArgs: unknown[][] = [];
let waiting: unknown[] = [];
vi.mock("./waiting", () => ({ waitingOn: async (...args: unknown[]) => (waitingArgs.push(args), waiting) }));
const asked: string[][] = [];
vi.mock("@/kernel/identity/team-people", () => ({
  peopleOnRecord: async (ids: string[]) => (asked.push(ids), new Map([["p-rowan", { name: "Rowan Example", archived: false }]])),
}));
// may-open reaches the access registers for its other exports; the inbox asks
// only the signed-in viewer's own access, so the registers are never read.
vi.mock("@/kernel/identity/access-of-person", () => ({ accessOf: async () => null }));

import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";
import { approvalsInbox } from "./inbox";

registerPermissionRegistry({
  atoms: {
    "reimbursements.check": { owner: "reimbursements", sentence: "Check submitted claims: confirm, send back", holders: [{ role: "finance", scope: "all" }] },
    "campaigns.publish": { owner: "campaigns", sentence: "Publish drafts: posts and letters", holders: [{ role: "revenue", scope: "all" }] },
    "time-off.manage": { owner: "time-off", sentence: "Run time off: requests, policies and history", holders: [{ role: "admin", scope: "all" }] },
    "reimbursements.approve": { owner: "reimbursements", sentence: "Approve checked claims", holders: [{ role: "reimbursement-approver", scope: "all" }] },
  },
  routes: {
    "/team/finance/claims/[id]": "reimbursements.check",
    "/admin/finance/reimbursements/[id]": "reimbursements.view",
    "/team/revenue/marketing/campaigns/[id]": "campaigns.marketing",
    "/admin/revenue/marketing/campaigns/[id]": "campaigns.marketing",
    "/admin/operations/time-off/requests": "time-off.manage",
    "/admin/operations/contractor-requests": "company-os.operations",
    "/admin/finance/reimbursements/to-approve": "reimbursements.approve",
    "/portal/agreements/[id]": "surface.portal",
  },
  actions: {},
  implies: {},
  roles: {},
});

const viewer = (permissions: string[], roles: string[] = []) => ({
  roles: roles.map((role) => ({ role, because: "test" })),
  permissions: () => permissions,
  may: (p: string) => permissions.includes(p),
});

const approval = (over: Record<string, unknown>) => ({
  id: "ap-1",
  subjectType: "reimbursement_check",
  subjectId: "cl-1",
  label: "Check claim: taxi",
  requestedBy: "p-rowan",
  approverPersonId: null,
  approverPermission: "reimbursements.check",
  createdAt: "2026-10-08T00:00:00Z",
  metadata: {},
  ...over,
});

beforeEach(() => {
  waitingArgs.length = 0;
  asked.length = 0;
  waiting = [];
});

describe("approvalsInbox", () => {
  it("asks waitingOn with the viewer's permissions, and for the unassigned only when they enter the Admin view", async () => {
    await approvalsInbox("p-juno", viewer(["surface.team", "reimbursements.check"]), { surface: "team" });
    await approvalsInbox("p-juno", viewer(["surface.team", "surface.admin"]), { surface: "team" });
    expect(waitingArgs).toEqual([
      ["p-juno", { admin: false, permissions: ["surface.team", "reimbursements.check"] }],
      ["p-juno", { admin: true, permissions: ["surface.team", "surface.admin"] }],
    ]);
  });

  it("names who asked, the role the row reaches the viewer through, and the page they may open", async () => {
    waiting = [approval({})];
    const [row] = await approvalsInbox("p-juno", viewer(["surface.team", "reimbursements.check"], ["team-member", "finance"]), { surface: "team" });
    expect(row).toMatchObject({
      subject: "Reimbursement: check",
      tier: 0,
      tierChip: "Internal",
      title: "Check claim: taxi",
      askedBy: "Rowan Example",
      namedOnMe: false,
      whose: "Your role: Finance",
      href: "/team/finance/claims/cl-1",
      cta: "Check the claim",
    });
    expect(asked).toEqual([["p-rowan"]]);
  });

  it("falls back to the atom's sentence when the role that grants it is not a declared holder", async () => {
    waiting = [approval({})];
    const [row] = await approvalsInbox("p-juno", viewer(["reimbursements.check"], ["one-person-role"]), { surface: "team" });
    expect(row.whose).toBe("Your role: Check submitted claims");
  });

  it("says You for a row that names the viewer, and links nowhere their access does not reach", async () => {
    waiting = [approval({ subjectType: "time_off", subjectId: "lv-1", approverPersonId: "p-juno", approverPermission: null, label: "Rowan · Annual · Oct 1" })];
    const [row] = await approvalsInbox("p-juno", viewer(["surface.team"]), { surface: "team" });
    expect(row).toMatchObject({ namedOnMe: true, whose: "You", href: null });
  });

  it("gives a row that names nobody to an admin who may decide it, by the role that lets them, linked to the admin board", async () => {
    waiting = [approval({ subjectType: "time_off", approverPersonId: null, approverPermission: null })];
    const [row] = await approvalsInbox("p-juno", viewer(["surface.team", "surface.admin", "time-off.manage"], ["admin"]), { surface: "team" });
    expect(row).toMatchObject({ namedOnMe: false, whose: "Your role: Admin", href: "/admin/operations/time-off/requests" });
  });

  // A custom role may carry surface.admin and nothing else. The rows that name
  // nobody reach it through waitingOn, but it cannot decide them, and a leave
  // row's label carries a colleague's name, type and dates.
  it("drops a row that names nobody when the viewer may open no page it is decided on", async () => {
    waiting = [
      approval({ id: "ap-leave", subjectType: "time_off", approverPersonId: null, approverPermission: null, label: "Someone · Sick · Oct 14" }),
      approval({ id: "ap-est", subjectType: "contractor_estimate", approverPersonId: null, approverPermission: null }),
    ];
    const rows = await approvalsInbox("p-juno", viewer(["surface.team", "surface.admin"]), { surface: "team" });
    expect(rows).toEqual([]);
    expect(asked).toEqual([[]]);
  });

  it("still lists a row addressed to a permission the viewer holds, without a link, when no page reaches it", async () => {
    waiting = [approval({ subjectType: "reimbursement_check", subjectId: "cl-9", approverPermission: "reimbursements.check" })];
    const [bare] = await approvalsInbox("p-juno", viewer(["reimbursements.check"], ["finance"]), { surface: "team" });
    expect(bare).toMatchObject({ whose: "Your role: Finance", href: null });
  });

  // mayOpen reads only the page's own declaration; the Admin and portal
  // layouts also ask for their surface atom, and would refuse the link.
  it("links an Admin page only for a viewer who enters the Admin view, and a portal page only with the portal", async () => {
    waiting = [approval({ subjectType: "reimbursement_approval", subjectId: "cl-2", approverPermission: "reimbursements.approve" })];
    const [noAdmin] = await approvalsInbox("p-juno", viewer(["surface.team", "reimbursements.approve"], ["reimbursement-approver"]), { surface: "team" });
    expect(noAdmin).toMatchObject({ whose: "Your role: Reimbursement approver", href: null });
    const [withAdmin] = await approvalsInbox("p-juno", viewer(["surface.team", "surface.admin", "reimbursements.approve"], ["reimbursement-approver"]), { surface: "team" });
    expect(withAdmin.href).toBe("/admin/finance/reimbursements/to-approve");

    waiting = [approval({ subjectType: "agreement_client_signature", subjectId: "ag-1", approverPersonId: "p-juno", approverPermission: null })];
    const [noPortal] = await approvalsInbox("p-juno", viewer(["surface.team"]), { surface: "team" });
    expect(noPortal).toMatchObject({ namedOnMe: true, href: null });
    const [withPortal] = await approvalsInbox("p-juno", viewer(["surface.team", "surface.portal"]), { surface: "team" });
    expect(withPortal.href).toBe("/portal/agreements/ag-1");
  });

  it("names the agent behind a draft no person asked for, and lists Tier 2 first", async () => {
    waiting = [
      approval({ id: "ap-old" }),
      approval({ id: "ap-draft", subjectType: "campaign_publish", subjectId: "cmp-1", requestedBy: null, approverPermission: "campaigns.publish" }),
    ];
    const rows = await approvalsInbox("p-juno", viewer(["surface.team", "campaigns.publish", "campaigns.marketing"], ["revenue"]), { surface: "team" });
    expect(rows.map((r) => r.id)).toEqual(["ap-draft", "ap-old"]);
    expect(rows[0]).toMatchObject({ askedBy: "The writer agent", tierChip: "Tier 2 · public", whose: "Your role: Revenue", href: "/team/revenue/marketing/campaigns/cmp-1" });
  });

  it("calls the viewer You when they asked themselves", async () => {
    waiting = [approval({ requestedBy: "p-juno", approverPersonId: "p-juno", approverPermission: null, subjectType: "agreement_edge8_signature", metadata: { dealId: "d-1" } })];
    const [row] = await approvalsInbox("p-juno", viewer([]), { surface: "team" });
    expect(row.askedBy).toBe("You");
  });
});
