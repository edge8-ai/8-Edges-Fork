import { describe, expect, it } from "vitest";
import type { OpenRole, OrgEntry } from "./directory-shapes";
import {
  buildOrgModel,
  descendantsOf,
  isLeaf,
  managerChain,
  matchesQuery,
  refuseReportingLine,
  wouldCreateLoop,
} from "./org-tree";

function person(id: string, managerId: string | null, extra: Partial<OrgEntry> = {}): OrgEntry {
  return {
    id,
    personId: `p-${id}`,
    name: id,
    legalName: null,
    avatarUrl: null,
    positionTitle: null,
    departmentName: null,
    location: null,
    employmentType: "full_time",
    managerId,
    ...extra,
  };
}

function role(id: string, hiringManagerPersonId: string | null): OpenRole {
  return { id, title: id, slug: null, location: null, employmentType: null, isPublic: false, hiringManagerPersonId };
}

describe("buildOrgModel", () => {
  it("hangs each person under their manager, contractors after employees, then by name", () => {
    const m = buildOrgModel(
      [
        person("dave", null),
        person("zoe", "dave"),
        person("amy", "dave", { employmentType: "contract" }),
        person("bob", "dave"),
      ],
      [],
    );
    expect(m.roots.map((e) => e.id)).toEqual(["dave"]);
    expect((m.kids.get("dave") ?? []).map((e) => e.id)).toEqual(["bob", "zoe", "amy"]);
  });

  it("lifts someone whose manager is not on the chart to the top rather than dropping them", () => {
    const m = buildOrgModel([person("dave", null), person("mai", "left-the-company")], []);
    expect(m.roots.map((e) => e.id)).toEqual(["dave", "mai"]);
    expect(m.loose).toEqual([]);
  });

  it("collects a manager loop and everyone under it as not connected, instead of losing them", () => {
    const m = buildOrgModel(
      [person("dave", null), person("a", "b"), person("b", "a"), person("c", "a")],
      [],
    );
    expect(m.roots.map((e) => e.id)).toEqual(["dave"]);
    expect(m.loose.map((e) => e.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("hangs an open role under its hiring manager by person id, and keeps the rest unplaced", () => {
    const m = buildOrgModel(
      [person("dave", null)],
      [role("eng", "p-dave"), role("orphan", null), role("gone", "p-nobody")],
    );
    expect(m.rolesFor("p-dave").map((r) => r.id)).toEqual(["eng"]);
    expect(m.unplacedRoles.map((r) => r.id)).toEqual(["orphan", "gone"]);
  });
});

describe("isLeaf", () => {
  it("is a leaf only with no reports and no open roles", () => {
    const m = buildOrgModel(
      [person("dave", null), person("minh", "dave"), person("tan", "minh"), person("viha", "dave")],
      [role("eng", "p-viha")],
    );
    expect(isLeaf(m, m.byId.get("tan")!)).toBe(true);
    expect(isLeaf(m, m.byId.get("minh")!)).toBe(false);
    expect(isLeaf(m, m.byId.get("viha")!)).toBe(false);
  });
});

describe("descendantsOf and managerChain", () => {
  const m = buildOrgModel(
    [person("dave", null), person("minh", "dave"), person("tan", "minh"), person("a", "b"), person("b", "a")],
    [],
  );

  it("lists everyone below a person, not the person", () => {
    expect([...descendantsOf(m, "dave")].sort()).toEqual(["minh", "tan"]);
  });

  it("reads the chain from the top down to the direct manager", () => {
    expect(managerChain(m, "tan").map((e) => e.id)).toEqual(["dave", "minh"]);
    expect(managerChain(m, "dave")).toEqual([]);
  });

  it("terminates on a loop", () => {
    expect([...descendantsOf(m, "a")].sort()).toEqual(["a", "b"]);
    expect(managerChain(m, "a").map((e) => e.id)).toEqual(["b"]);
  });
});

describe("wouldCreateLoop", () => {
  const edges = [
    { id: "dave", managerId: null },
    { id: "minh", managerId: "dave" },
    { id: "tan", managerId: "minh" },
    { id: "viha", managerId: "dave" },
  ];

  it("refuses being your own manager", () => {
    expect(wouldCreateLoop(edges, "minh", "minh")).toBe(true);
  });

  it("refuses reporting to someone in your own team", () => {
    expect(wouldCreateLoop(edges, "dave", "tan")).toBe(true);
    expect(wouldCreateLoop(edges, "minh", "tan")).toBe(true);
  });

  it("allows moving to someone outside your team, or to no manager", () => {
    expect(wouldCreateLoop(edges, "tan", "viha")).toBe(false);
    expect(wouldCreateLoop(edges, "minh", null)).toBe(false);
  });

  it("terminates when the existing data already holds a loop elsewhere", () => {
    const looped = [...edges, { id: "a", managerId: "b" }, { id: "b", managerId: "a" }];
    expect(wouldCreateLoop(looped, "tan", "a")).toBe(false);
  });
});

describe("refuseReportingLine", () => {
  const rows = [
    { id: "dave", managerId: null, status: "active" },
    { id: "minh", managerId: "dave", status: "active" },
    { id: "tan", managerId: "minh", status: "on_leave" },
    { id: "gone", managerId: "dave", status: "alumni" },
    { id: "soon", managerId: null, status: "pre_start" },
  ];

  it("allows a current manager outside the person's team, and clearing the manager", () => {
    expect(refuseReportingLine(rows, "tan", "dave")).toBeNull();
    expect(refuseReportingLine(rows, "tan", null)).toBeNull();
  });

  it("refuses someone who has left or has not started, because the chart would not show them", () => {
    expect(refuseReportingLine(rows, "tan", "gone")).toMatch(/not on the chart/);
    expect(refuseReportingLine(rows, "tan", "soon")).toMatch(/not on the chart/);
    expect(refuseReportingLine(rows, "tan", "nobody")).toMatch(/not on the chart/);
  });

  it("refuses a loop with a sentence that says why", () => {
    expect(refuseReportingLine(rows, "minh", "minh")).toMatch(/own manager/);
    expect(refuseReportingLine(rows, "dave", "tan")).toMatch(/loop/);
  });
});

describe("matchesQuery", () => {
  const mai = person("mai", null, {
    name: "Mai Đặng",
    legalName: "Đặng Phương Mai",
    positionTitle: "Technical Recruiter",
    location: "Ho Chi Minh City",
  });

  it("matches names with or without Vietnamese marks", () => {
    expect(matchesQuery(mai, "dang", "all")).toBe(true);
    expect(matchesQuery(mai, "phuong", "all")).toBe(true);
  });

  it("matches title and city, and nothing else", () => {
    expect(matchesQuery(mai, "recruit", "all")).toBe(true);
    expect(matchesQuery(mai, "chi minh", "all")).toBe(true);
    expect(matchesQuery(mai, "hanoi", "all")).toBe(false);
  });

  it("applies the location filter on top of the text", () => {
    expect(matchesQuery(mai, "", "Hanoi")).toBe(false);
    expect(matchesQuery(mai, "", "Ho Chi Minh City")).toBe(true);
  });
});
