import { describe, expect, it, vi } from "vitest";

// goals.ts reaches for the service-role client at module scope; the functions
// under test are pure, so a stub is enough to let the module load.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

const {
  buildLadderIndex,
  groupByObjective,
  groupByPerson,
  profileToMember,
  resolveCompanyObjectiveId,
} = await import("./company-goals");

type Obj = { id: string; level: string; parent_kr_id: string | null };

// A two-level tree: company objective C1 has KR k1; team objective T1 hangs off
// k1 and has its own KR k2. So a goal on k2 must roll up to C1.
const objectives: Obj[] = [
  { id: "C1", level: "company", parent_kr_id: null },
  { id: "T1", level: "team", parent_kr_id: "k1" },
  { id: "ORPHAN", level: "team", parent_kr_id: null },
];
const krs = [
  { id: "k1", objective_id: "C1" },
  { id: "k2", objective_id: "T1" },
  { id: "k3", objective_id: "ORPHAN" },
];
const idx = buildLadderIndex(
  objectives as never,
  krs,
  new Set(["C1"]),
);

const goal = (over: Partial<Parameters<typeof resolveCompanyObjectiveId>[0]> = {}) => ({
  coaching_profile_id: "p1",
  title: "Goal",
  objective_id: null,
  key_result_id: null,
  ...over,
});

describe("resolveCompanyObjectiveId", () => {
  it("resolves a KR on a company objective to that objective", () => {
    expect(resolveCompanyObjectiveId(goal({ key_result_id: "k1" }), idx)).toBe("C1");
  });

  it("walks a lower-level objective up through its parent KR", () => {
    // k2 -> T1 (team) -> parent_kr_id k1 -> C1 (company).
    expect(resolveCompanyObjectiveId(goal({ key_result_id: "k2" }), idx)).toBe("C1");
    expect(resolveCompanyObjectiveId(goal({ objective_id: "T1" }), idx)).toBe("C1");
  });

  it("returns null for a goal with no ladder at all", () => {
    expect(resolveCompanyObjectiveId(goal(), idx)).toBeNull();
  });

  it("returns null when the walk never reaches a company objective", () => {
    // ORPHAN is a team objective with no parent KR, so the walk dead-ends.
    expect(resolveCompanyObjectiveId(goal({ key_result_id: "k3" }), idx)).toBeNull();
    expect(resolveCompanyObjectiveId(goal({ objective_id: "ORPHAN" }), idx)).toBeNull();
  });

  it("returns null for an unknown key result or objective", () => {
    expect(resolveCompanyObjectiveId(goal({ key_result_id: "nope" }), idx)).toBeNull();
    expect(resolveCompanyObjectiveId(goal({ objective_id: "nope" }), idx)).toBeNull();
  });

  it("terminates on a parent_kr_id cycle instead of spinning", () => {
    // A1 -> kA -> A2 -> kB -> A1. Malformed, but the guard must bound it.
    const cyclic = buildLadderIndex(
      [
        { id: "A1", level: "team", parent_kr_id: "kB" },
        { id: "A2", level: "team", parent_kr_id: "kA" },
      ] as never,
      [
        { id: "kA", objective_id: "A1" },
        { id: "kB", objective_id: "A2" },
      ],
      new Set(["C1"]),
    );
    expect(resolveCompanyObjectiveId(goal({ objective_id: "A1" }), cyclic)).toBeNull();
  });
});

describe("profileToMember", () => {
  it("maps every profile a member holds back to that member", () => {
    const map = profileToMember([
      {
        id: "tm1",
        people: { full_name: "Ada Lovelace", preferred_name: "Ada", avatar_url: "a.png" },
        coaching_profiles: [{ id: "p1" }, { id: "p2" }],
      },
    ]);
    expect(map.get("p1")).toEqual({ teamMemberId: "tm1", name: "Ada", avatarUrl: "a.png", departmentId: null });
    expect(map.get("p2")?.teamMemberId).toBe("tm1");
  });

  it("accepts either embed shape and falls back through the name chain", () => {
    const map = profileToMember([
      // to-one embed as a one-element array, to-many as a bare object.
      { id: "tm2", people: [{ full_name: "Grace Hopper", preferred_name: null, avatar_url: null }], coaching_profiles: { id: "p3" } },
      { id: "tm3", people: null, coaching_profiles: [{ id: "p4" }] },
    ]);
    expect(map.get("p3")).toEqual({ teamMemberId: "tm2", name: "Grace Hopper", avatarUrl: null, departmentId: null });
    expect(map.get("p4")?.name).toBe("Unknown");
  });

  it("skips a member holding no profile", () => {
    expect(profileToMember([{ id: "tm4", people: null, coaching_profiles: null }]).size).toBe(0);
  });
});

const person = (teamMemberId: string, name: string) => ({ teamMemberId, name, avatarUrl: null, departmentId: null });
const resolved = [
  { ...person("tm1", "Ada"), goalTitle: "Ship it", ladder: "KR one", objId: "C1" },
  { ...person("tm2", "Zoe"), goalTitle: "Hire two", ladder: null, objId: "C1" },
  { ...person("tm1", "Ada"), goalTitle: "Loose end", ladder: null, objId: null },
];

describe("groupByPerson", () => {
  it("returns one alphabetical row per roster member, including members with no goals", () => {
    const roster = [
      { id: "tm2", people: { full_name: null, preferred_name: "Zoe", avatar_url: null }, coaching_profiles: null },
      { id: "tm1", people: { full_name: null, preferred_name: "Ada", avatar_url: null }, coaching_profiles: null },
      { id: "tm9", people: { full_name: null, preferred_name: "Mo", avatar_url: null }, coaching_profiles: null },
    ];
    expect(groupByPerson(roster, resolved)).toEqual([
      { teamMemberId: "tm1", name: "Ada", departmentId: null, goals: [{ title: "Ship it", ladder: "KR one" }, { title: "Loose end", ladder: null }] },
      { teamMemberId: "tm9", name: "Mo", departmentId: null, goals: [] },
      { teamMemberId: "tm2", name: "Zoe", departmentId: null, goals: [{ title: "Hire two", ladder: null }] },
    ]);
  });
});

describe("groupByObjective", () => {
  const tree = [{ id: "C1", title: "Grow", brand: null, krs: [] }] as never;

  it("numbers the objectives and sorts each card's members by name", () => {
    const groups = groupByObjective(tree, resolved);
    expect(groups[0].objectiveId).toBe("C1");
    expect(groups[0].label).toBe("O1 · Grow");
    expect(groups[0].items.map((i) => i.name)).toEqual(["Ada", "Zoe"]);
  });

  it("appends a catch-all card for goals that resolved to no objective", () => {
    const groups = groupByObjective(tree, resolved);
    expect(groups).toHaveLength(2);
    expect(groups[1].objectiveId).toBeNull();
    expect(groups[1].items.map((i) => i.goalTitle)).toEqual(["Loose end"]);
  });

  it("omits the catch-all entirely when every goal is aligned", () => {
    const aligned = resolved.filter((r) => r.objId !== null);
    expect(groupByObjective(tree, aligned)).toHaveLength(1);
  });
});
