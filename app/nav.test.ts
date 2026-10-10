// The C.9 sidebar matrix, asserted against the navigation this deployment
// actually ships — `TEAM_NAV` from the generated app/nav.ts, not a fixture.
// That matters: the rows are contributed by five separate entities and composed
// somewhere none of them can see, so a fixture would only prove the filter
// works on rows the test wrote itself. Reading the real nav means a row whose
// page changes permission, or an entity that contributes a row into the wrong
// group, fails here.
import { describe, expect, it } from "vitest";

// These assert the navigation of the edge8 deployment. On a tree generated for
// another deployment app/nav.ts composes a different set of entities and the
// matrices below are simply not the right ones, so the file steps aside.
const DEPLOYMENT = process.env.EDGE8_DEPLOYMENT ?? "edge8";
const describeEdge8 = DEPLOYMENT === "edge8" ? describe : describe.skip;
import { ADMIN_NAV, PORTAL_NAV, TEAM_NAV } from "@/app/nav";
import { entitlementKeys, gateByEntitlement, withPrograms } from "@/entities/portal/client";
import { isSubsection, keepRows, makeIsActive, type NavItem, type NavSection } from "@/kernel/shell/nav";
import { PERMISSIONS } from "@/app/permissions";
import { permissionForPath } from "@/kernel/identity/permission-lookup";
import { resolveAccess, type RolePermission } from "@/kernel/identity/access-model";

// The team hub's sidebar keeps a row only for someone who may open its page
// (AC.8): each viewer is the roles they hold, resolved through the declared
// default holders, exactly as the Team layout resolves them.
const DEFAULTS: RolePermission[] = Object.entries(PERMISSIONS.atoms).flatMap(([permission, a]) =>
  a.holders.map((h) => ({ role: h.role, permission, scope: h.scope })),
);

// What this viewer's sidebar reads, group by group, top to bottom.
function sidebarOf(...roles: string[]): Record<string, string[]> {
  const access = resolveAccess(
    roles.map((role) => ({ role, because: "test" })),
    DEFAULTS,
    { personId: "p-1", reportIds: [], clientIds: [] },
  );
  const kept = keepRows(TEAM_NAV as NavSection[], (item) => {
    const permission = permissionForPath(PERMISSIONS.routes, item.href);
    return permission === null || permission === "public" || access.may(permission);
  });
  const out: Record<string, string[]> = {};
  for (const section of kept) {
    for (const group of section.groups) {
      out[group.label ?? "(top)"] = group.items.map((i) => (isSubsection(i) ? `{${i.subheading}}` : i.label));
    }
  }
  return out;
}

const MEMBER = "team-member";

describeEdge8("the team hub sidebar", () => {
  it("shows a plain member no My Team group at all", () => {
    const nav = sidebarOf(MEMBER);
    // Every row in My Team needs a role a plain member does not hold, so the
    // group empties and is dropped: the team hub removes rows, unlike the portal.
    expect(nav["My Team"]).toBeUndefined();
    expect(nav["My Work"]).toEqual(["My week", "Board", "List", "Calendar", "Sprint planning", "Time Off"]);
  });

  it("opens My Team for a coach with Coaching alone", () => {
    expect(sidebarOf(MEMBER, "coach")["My Team"]).toEqual(["Coaching"]);
  });

  it("opens My Team for a requisition owner with Hiring alone", () => {
    expect(sidebarOf(MEMBER, "hiring-manager")["My Team"]).toEqual(["Hiring"]);
  });

  it("opens My Team for a manager with Coaching and Onboarding", () => {
    // A manager may build a roster (/team/coaching admits them) and follows
    // their reports' onboarding; their team's leave waits in Approvals, under Me.
    expect(sidebarOf(MEMBER, "manager")["My Team"]).toEqual(["Coaching", "Onboarding"]);
  });

  // Z.2.1. The approvals inbox lists what waits on whoever opens it, a role
  // they hold included, so every team login has the row, beside the Inbox.
  it("gives every team login Approvals under Me, whether or not anything waits on them", () => {
    for (const roles of [[MEMBER], ["contractor"], [MEMBER, "approver"], [MEMBER, "manager"]]) {
      expect(sidebarOf(...roles)["Me"]?.slice(0, 2)).toEqual(["Inbox", "Approvals"]);
    }
    expect(sidebarOf(MEMBER, "approver")["My Team"]).toBeUndefined();
  });

  it("shows Clients only to someone on a client's team", () => {
    expect(sidebarOf(MEMBER)["My Work"]).not.toContain("Clients");
    expect(sidebarOf(MEMBER, "client-team")["My Work"]).toEqual([
      "My week",
      "Board",
      "List",
      "Calendar",
      "Sprint planning",
      "Clients",
      "Time Off",
    ]);
  });

  it("gives a contractor their own pages and the Company module page by page, without health cover (AE.3)", () => {
    const nav = sidebarOf("contractor");
    expect(nav["Me"]).toEqual(["Inbox", "Approvals", "My Coach", "Reviews", "Ideas", "My Claims", "Profile", "My Equipment"]);
    expect(nav["Company"]).toEqual(expect.arrayContaining(["Strategy", "Vendors", "Handbook"]));
    expect(nav["Company"]).not.toContain("Health Insurance");
    const withCompany = sidebarOf("contractor", "company");
    expect(withCompany["Me"]).toContain("Ideas");
    expect(withCompany["Company"]).toEqual(expect.arrayContaining(["Strategy", "Vendors", "Handbook"]));
    expect(withCompany["Company"]).not.toContain("Health Insurance");
  });

  it("gives every team member the same Me and Company rows", () => {
    const me = ["Inbox", "Approvals", "My Coach", "Reviews", "Ideas", "My Claims", "Profile", "My Equipment"];
    for (const roles of [[MEMBER], [MEMBER, "manager"], [MEMBER, "coach"]]) {
      expect(sidebarOf(...roles)["Me"]).toEqual(me);
      expect(sidebarOf(...roles)["Company"]).toContain("Strategy");
      // Every member browses and adds vendors; bank and tax fields stay admin-only.
      expect(sidebarOf(...roles)["Company"]).toContain("Vendors");
    }
  });

  it("shows the Revenue group to the Revenue role and to an admin on the team, and to nobody else", () => {
    expect(sidebarOf(MEMBER)["Revenue"]).toBeUndefined();
    for (const roles of [[MEMBER, "revenue"], [MEMBER, "admin"]]) {
      const kept = keepRows(TEAM_NAV as NavSection[], (item) => {
        const permission = permissionForPath(PERMISSIONS.routes, item.href);
        const access = resolveAccess(roles.map((role) => ({ role, because: "test" })), DEFAULTS, { personId: "p-1", reportIds: [], clientIds: [] });
        return permission === null || permission === "public" || access.may(permission);
      });
      const revenue = kept.flatMap((s) => s.groups).find((g) => g.label === "Revenue");
      // Split like the admin Revenue office: sales (CRM), commerce, and marketing.
      expect(revenue?.items.map((i) => (isSubsection(i) ? `${i.subheading}: ${i.items.map((x) => x.label).join(", ")}` : i.label))).toEqual([
        "CRM: Cockpit, Deals, Leads, Inquiries, Companies, Clients, Account Health, Meeting Notes, Sales Intelligence",
        "Commerce: Orders, Invoices, AIO Pad, Events, Products, Affiliates",
        "Marketing: Overview, Campaigns, Broadcasts, Brands, Books",
      ]);
    }
  });

  // RB.3. A checker who is not an admin (a contractor in Finance) has no
  // admin home, so this row and the approvals inbox are their ways into the
  // queue: the Finance slot in kernel/shell/team-ia.ts, the To Check row the
  // reimbursements entity contributes into it, and the page that row opens,
  // declared under the permission the check is addressed to.
  it("gives a Finance checker the Finance group with To Check, between Revenue and Company", () => {
    const nav = sidebarOf("contractor", "finance");
    expect(nav["Finance"]).toEqual(["To Check"]);
    const groups = Object.keys(nav);
    expect(groups.indexOf("Finance")).toBeGreaterThan(groups.indexOf("Me"));
    expect(groups.indexOf("Finance")).toBeLessThan(groups.indexOf("Company"));
    const row = TEAM_NAV.flatMap((sec) => sec.groups)
      .find((g) => g.label === "Finance")
      ?.items.find((i) => !isSubsection(i) && i.label === "To Check");
    expect(row && !isSubsection(row) ? row.href : null).toBe("/team/finance/claims/to-check");
    expect(permissionForPath(PERMISSIONS.routes, "/team/finance/claims/to-check")).toBe("reimbursements.check");
  });

  it("shows the Finance group to nobody who does not check claims, admins and Super Admins included (decision 9)", () => {
    for (const roles of [[MEMBER], ["contractor"], [MEMBER, "manager"], [MEMBER, "admin"], [MEMBER, "super-admin"]]) {
      expect(sidebarOf(...roles)["Finance"]).toBeUndefined();
    }
  });

  it("carries no `when` on any team row: a row follows its page's permission alone", () => {
    const rows = TEAM_NAV.flatMap((s) => s.groups.flatMap((g) => g.items.flatMap((i) => (isSubsection(i) ? i.items : [i]))));
    expect(rows.filter((r) => r.when).map((r) => r.label)).toEqual([]);
  });
});

// The same idea for the portal: the entitlement rule has its own unit test
// beside the gate, on a fixture, because that file may not import app/. This
// runs the rule over the navigation the deployment actually composes, so a
// contributed row that loses its `when`, or a key nobody contributes, fails.
describeEdge8("the portal sidebar", () => {
  const NONE = Object.fromEntries(
    ["team", "timeOff", "invoices", "users", "companyProfile", "meetings", "board", "roadmap", "tokens"].map((k) => [k, false]),
  );
  const rowsOf = (held: Record<string, boolean>) =>
    gateByEntitlement(PORTAL_NAV as NavSection[], entitlementKeys(held)).flatMap((g) =>
      g.items.map((i) => (isSubsection(i) ? `{${i.subheading}}` : `${i.label}${i.enabled ? "" : " (soon)"}`)),
    );

  it("keeps every composed row for a client entitled to nothing, muted", () => {
    const rows = rowsOf(NONE);
    const gated = PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items)).filter((i) => !isSubsection(i) && i.when);
    expect(gated.length).toBeGreaterThan(4);
    for (const item of gated) if (!isSubsection(item)) expect(rows).toContain(`${item.label} (soon)`);
    // and nothing is missing: the row count is the composed row count
    expect(rows.length).toBe(PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items)).length);
  });

  it("uses only keys the entitlement resolver produces", () => {
    // A row gated on a key portalEntitlements never sets could never light up.
    const keys = new Set(Object.keys(NONE));
    const orphan = PORTAL_NAV.flatMap((s) => s.groups.flatMap((g) => g.items))
      .filter((i) => !isSubsection(i) && i.when && !keys.has(i.when))
      .map((i) => (isSubsection(i) ? "" : `${i.label} gated on ${i.when}`));
    expect(orphan).toEqual([]);
  });

  it("lights Users and Company Profile for an admin only", () => {
    const admin = rowsOf({ ...NONE, users: true, companyProfile: true });
    expect(admin).toContain("Users");
    expect(admin).toContain("Company Profile");
    expect(rowsOf(NONE)).toContain("Users (soon)");
  });

  // W.101 moved the sidebar's active row from a local copy onto the kernel's
  // makeIsActive. The card feared a visible change on a client-facing surface;
  // these pin that there is none, by asking both rules about every page under
  // every row the sidebar draws, program links included.
  describe("active row, on the shared rule", () => {
    const PROGRAMS = [
      { id: "p-one", name: "Pilot program" },
      { id: "p-two", name: "Second program" },
    ];
    const groups = withPrograms(gateByEntitlement(PORTAL_NAV as NavSection[], entitlementKeys({})), PROGRAMS);
    const rows = groups.flatMap((g) => g.items).filter((i): i is NavItem => !isSubsection(i));
    const shared = makeIsActive([{ section: null, groups }]);
    // The copy PortalSidebar carried until W.101, verbatim.
    const local = (pathname: string, href: string) =>
      href === "/portal"
        ? pathname === "/portal" || pathname === "/portal/"
        : pathname === href || pathname.startsWith(`${href}/`);
    const litBy = (rule: (pathname: string, href: string) => boolean, pathname: string) =>
      rows.filter((r) => rule(pathname, r.href)).map((r) => r.label);

    const pages = [
      "/portal",
      "/portal/",
      "/portal/change-password",
      "/portal/programs",
      "/portal/nowhere",
      ...rows.flatMap((r) => [r.href, `${r.href}/`, `${r.href}/abc`, `${r.href}/abc/edit`]),
    ];

    it("lights the same rows as the local copy on every page", () => {
      for (const page of pages) expect([page, litBy(shared, page)]).toEqual([page, litBy(local, page)]);
    });

    it("lights Home on the portal root alone", () => {
      expect(litBy(shared, "/portal")).toEqual(["Home"]);
      expect(litBy(shared, "/portal/requests/abc")).toEqual(["Requests"]);
      expect(litBy(shared, "/portal/nowhere")).toEqual([]);
    });

    it("lights one program's link, not its siblings", () => {
      expect(litBy(shared, "/portal/programs/p-one/report")).toEqual(["Pilot program"]);
    });
  });
});

// The C.8 matrix against the real composed ADMIN_NAV, now from the page
// permissions (AC.11): each viewer keeps the rows whose pages their roles may
// open, resolved through the declared default holders as the Admin layout does.
// A plain admin and a super-admin differ only in the super-admin pages; every
// group and every "soon" row is identical for both, because a muted row is how
// the shell says "coming" and a missing row is how it says "not for you".
const ADMIN_DEFAULTS: RolePermission[] = Object.entries(PERMISSIONS.atoms).flatMap(([permission, a]) =>
  a.holders.map((h) => ({ role: h.role, permission, scope: h.scope })),
);
function adminNavFor(...roles: string[]): NavSection[] {
  const access = resolveAccess(roles.map((role) => ({ role, because: "test" })), ADMIN_DEFAULTS, { personId: "p-1", reportIds: [], clientIds: [] });
  return keepRows(ADMIN_NAV as NavSection[], (item) => {
    const permission = permissionForPath(PERMISSIONS.routes, item.href);
    return permission === null || permission === "public" || access.may(permission);
  });
}

describeEdge8("the admin sidebar", () => {
  const flat = (sections: NavSection[]) =>
    sections.flatMap((s) =>
      s.groups.flatMap((g) =>
        g.items.flatMap((i) =>
          isSubsection(i)
            ? i.items.map((x) => `[${s.section ?? "-"}] ${g.label ?? "-"} / {${i.subheading}} ${x.label}${x.enabled ? "" : "~"}`)
            : [`[${s.section ?? "-"}] ${g.label ?? "-"} / ${i.label}${i.enabled ? "" : "~"}`],
        ),
      ),
    );
  const superAdmin = flat(adminNavFor("admin", "super-admin"));
  const admin = flat(adminNavFor("admin"));

  it("hides exactly the super-admin pages from a plain admin, and nothing else", () => {
    const hidden = superAdmin.filter((row) => !admin.includes(row));
    expect(hidden).toEqual([
      "[Four Offices] Talent / {ATS} Applications",
      "[Four Offices] Talent / {ATS} Job Reqs",
      "[Four Offices] Talent / {ATS} Candidate Pool",
      "[Workspace] Settings / {Configuration} Legal entities",
    ]);
    expect(admin.every((row) => superAdmin.includes(row))).toBe(true);
  });

  // Finance keeps the registration details current and a Super Admin names the
  // companies, so both reach the page; a plain admin or a team member does not.
  it("shows Legal entities under Settings to a super-admin and to finance only", () => {
    const row = "[Workspace] Settings / {Configuration} Legal entities";
    expect(superAdmin).toContain(row);
    expect(flat(adminNavFor("finance"))).toContain(row);
    expect(admin).not.toContain(row);
    expect(flat(adminNavFor("team-member"))).not.toContain(row);
  });

  it("keeps every 'soon' row for both viewers, muted rather than dropped", () => {
    expect(admin.filter((row) => /~$/.test(row))).toEqual(superAdmin.filter((row) => /~$/.test(row)));
    expect(admin.filter((row) => /~$/.test(row)).length).toBeGreaterThan(0);
  });

  it("ships the sections and groups in the order the shell declares", () => {
    const groups = ADMIN_NAV.flatMap((s) => s.groups.map((g) => `${s.section ?? "-"} / ${g.label ?? "-"}`));
    expect(groups).toEqual([
      "Operating System / Edges",
      "Operating System / Company",
      "Four Offices / Revenue",
      "Four Offices / Talent",
      "Four Offices / Operations",
      "Four Offices / Finance",
      "Four Offices / Innovation",
      "Workspace / Settings",
      "Workspace / -",
    ]);
  });

  it("gives a super-admin every composed row but the paying one, which follows a role, not rank", () => {
    // Paying claims is held by the Reimbursement payer (RB.6), so Payment Runs
    // is not a super-admin's. Claims are one row for everyone in the Admin
    // view (RB.14): its page sends each viewer to the first tab their role
    // reaches, so checking and approving still follow a role, on the tabs.
    const claims = "[Four Offices] Finance / {Reimbursements} Reimbursements";
    const paying = ["[Four Offices] Finance / {Reimbursements} Payment Runs"];
    expect(superAdmin).toEqual(flat(ADMIN_NAV as NavSection[]).filter((row) => !paying.includes(row)));
    expect(superAdmin).toContain(claims);
    const approver = flat(adminNavFor("admin", "employer", "reimbursement-approver"));
    expect(approver).toContain(claims);
    const payer = flat(adminNavFor("admin", "reimbursement-payer"));
    expect(paying.every((row) => payer.includes(row))).toBe(true);
  });
});
