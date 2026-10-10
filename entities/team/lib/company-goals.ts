// The company goals roll-up: the quarter's objectives and key results (org's)
// with the personal goals laddering up to them (team's). It lives in team
// because `goals` is team's table and the objectives come through org's door —
// the other way round made org depend on team, and team already depends on org,
// which is a cycle (RS-09).
import { selectGoals } from "@/entities/coaching";
import { companyOs } from "@/kernel/data/supabase";
import {
  KR_SELECT,
  OBJECTIVE_SELECT,
  BRAND_LABELS,
  currentQuarter,
  objectiveCode,
  personInitials,
  type KrRow,
  type ObjectiveGroup,
  type ObjectiveWithKrs,
  type LadderedPerson,
  type ObjectiveRow,
  type PersonGroup,
  selectKeyResults,
  selectObjectives,
} from "@/entities/org";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Shared derivation for the Company Goals view (/team/company-goals and the
// admin Company section). Same data as /admin/edges/goals but flattened: the
// company-level objectives with their key results, plus every active employee's
// FAST goals laddered back to the company objective each ultimately serves.
export type { ObjectiveWithKrs, LadderedPerson };

export type CompanyGoals = {
  quarter: ReturnType<typeof currentQuarter>;
  tree: ObjectiveWithKrs[];
  initialsById: Record<string, string>;
  ladderedByKr: Record<string, LadderedPerson[]>;
  byPerson: PersonGroup[];
  byObjective: ObjectiveGroup[];
  withGoal: number;
  // The departments the roster spans, for the Team member goals filter.
  departments: { id: string; name: string }[];
};

// The two row shapes the rollup below works over. They are the selects in
// getCompanyGoals, named here so the pure functions can be exercised without a
// database.
type PersonEmbed = NamedPerson & { avatar_url: string | null };
type ProfileEmbed = { id: string };
type DepartmentEmbed = { id: string; name: string };
export type RosterRow = {
  id: string;
  people: PersonEmbed | PersonEmbed[] | null;
  coaching_profiles: ProfileEmbed | ProfileEmbed[] | null;
  departments?: DepartmentEmbed | DepartmentEmbed[] | null;
};
export type TeamGoalRow = {
  coaching_profile_id: string;
  title: string;
  objective_id: string | null;
  key_result_id: string | null;
};

// A goal already attached to its owner and its company objective. Both
// groupings below derive from a list of these.
export type ResolvedGoal = LadderedPerson & {
  goalTitle: string;
  ladder: string | null;
  objId: string | null;
};

// The lookup tables the ladder walk needs, built once from the quarter's rows.
export type LadderIndex = {
  objById: Map<string, Pick<ObjectiveRow, "id" | "level" | "parent_kr_id">>;
  krObjective: Map<string, string>;
  companyObjectiveIds: Set<string>;
};

// PostgREST embeds arrive as an object or a one-element array; `one` handles the
// to-one case, and this is the to-many counterpart (no kernel equivalent).
const many = <T,>(e: T | T[] | null): T[] => (Array.isArray(e) ? e : e ? [e] : []);

export function buildLadderIndex(
  objectives: Pick<ObjectiveRow, "id" | "level" | "parent_kr_id">[],
  allKrs: Pick<KrRow, "id" | "objective_id">[],
  companyObjectiveIds: Set<string>,
): LadderIndex {
  return {
    objById: new Map(objectives.map((o) => [o.id, o] as const)),
    krObjective: new Map(allKrs.map((kr) => [kr.id, kr.objective_id] as const)),
    companyObjectiveIds,
  };
}

// Resolve a goal to the COMPANY objective it ultimately ladders to, or null.
// A KR resolves to its objective; a lower-level objective rolls up through its
// parent KR. Anything that doesn't land on a company objective (no ladder, or
// an orphan) returns null. The guard bounds a parent_kr_id cycle: a malformed
// tree would otherwise spin here forever, and 10 is far deeper than any real
// objective hierarchy.
export function resolveCompanyObjectiveId(g: TeamGoalRow, idx: LadderIndex): string | null {
  let objId: string | null = null;
  if (g.key_result_id) objId = idx.krObjective.get(g.key_result_id) ?? null;
  else if (g.objective_id) objId = g.objective_id;
  for (let guard = 0; objId && guard < 10; guard++) {
    const obj = idx.objById.get(objId);
    if (!obj || obj.level === "company") break;
    objId = obj.parent_kr_id ? idx.krObjective.get(obj.parent_kr_id) ?? null : null;
  }
  return objId && idx.companyObjectiveIds.has(objId) ? objId : null;
}

// profile -> the member who owns it (a member may hold more than one profile).
export function profileToMember(roster: RosterRow[]): Map<string, LadderedPerson> {
  const out = new Map<string, LadderedPerson>();
  for (const tm of roster) {
    const person = one(tm.people);
    const name = personName(one(tm.people), "Unknown");
    for (const p of many(tm.coaching_profiles))
      out.set(p.id, { teamMemberId: tm.id, name, avatarUrl: person?.avatar_url ?? null, departmentId: one(tm.departments ?? null)?.id ?? null });
  }
  return out;
}

// One row per roster member, alphabetical, carrying only that member's goals.
export function groupByPerson(roster: RosterRow[], resolved: ResolvedGoal[]): PersonGroup[] {
  return roster
    .map((tm) => ({
      teamMemberId: tm.id,
      name: personName(one(tm.people), "Unknown"),
      departmentId: one(tm.departments ?? null)?.id ?? null,
      goals: resolved
        .filter((r) => r.teamMemberId === tm.id)
        .map((r) => ({ title: r.goalTitle, ladder: r.ladder })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// One card per company objective, plus a trailing catch-all for the goals that
// never resolved to one (only when there are any).
export function groupByObjective(tree: ObjectiveWithKrs[], resolved: ResolvedGoal[]): ObjectiveGroup[] {
  const out: ObjectiveGroup[] = tree.map((o, oi) => ({
    objectiveId: o.id,
    label: `${objectiveCode(oi)} · ${o.title}`,
    lineTag: o.brand ?? "company",
    lineLabel: BRAND_LABELS[o.brand ?? "company"],
    items: resolved
      .filter((r) => r.objId === o.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ teamMemberId: r.teamMemberId, name: r.name, departmentId: r.departmentId, goalTitle: r.goalTitle, ladder: r.ladder })),
  }));
  const unaligned = resolved.filter((r) => r.objId === null).sort((a, b) => a.name.localeCompare(b.name));
  if (unaligned.length) {
    out.push({
      objectiveId: null,
      label: "Not yet aligned to a company objective",
      lineTag: "company",
      lineLabel: "",
      items: unaligned.map((r) => ({
        teamMemberId: r.teamMemberId,
        name: r.name,
        departmentId: r.departmentId,
        goalTitle: r.goalTitle,
        ladder: r.ladder,
      })),
    });
  }
  return out;
}

export async function getCompanyGoals(): Promise<CompanyGoals> {
  const q = currentQuarter();

  const [objRes, krRes, rosterRes, teamGoalsRes] = await Promise.all([
    // All levels this year (company goals are set per year and reviewed each
    // quarter): company-level objectives render as cards, the lower levels
    // only feed the FAST-goal ladder rollup below.
    selectObjectives(OBJECTIVE_SELECT)
      .eq("year", q.start.getFullYear())
      .neq("status", "dropped")
      .order("sort_order")
      .order("id"),
    selectKeyResults(KR_SELECT).order("sort_order").order("id"),
    // Employees only: contractors don't carry FAST goals.
    companyOs
      .from("team_members")
      .select(
        `id, people:people!person_id(${NAME_COLUMNS}, avatar_url), coaching_profiles:coaching_profiles!team_member_id(id), departments:departments!department_id(id, name)`,
      )
      .eq("status", "active")
      .neq("employment_type", "contract"),
    selectGoals("coaching_profile_id, title, objective_id, key_result_id")
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const objectives = (objRes.data ?? []) as ObjectiveRow[];
  const allKrs = (krRes.data ?? []) as KrRow[];
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const krs = allKrs.filter((kr) => objectiveIds.has(kr.objective_id));
  const companyObjectives = objectives.filter((o) => o.level === "company");
  const companyObjectiveIds = new Set(companyObjectives.map((o) => o.id));
  const krsByObjective = new Map<string, KrRow[]>();
  for (const kr of krs) {
    krsByObjective.set(kr.objective_id, [...(krsByObjective.get(kr.objective_id) ?? []), kr]);
  }
  const tree: ObjectiveWithKrs[] = companyObjectives.map((o) => ({ ...o, krs: krsByObjective.get(o.id) ?? [] }));

  const personIds = Array.from(new Set(tree.flatMap((o) => o.krs.map((kr) => kr.accountable_person_id))));
  const peopleRes = personIds.length
    ? await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", personIds)
    : { data: [] };
  const initialsById: Record<string, string> = {};
  for (const p of (peopleRes.data ?? []) as ({ id: string } & NamedPerson)[]) {
    // From the display name, Given + Family: full_name's order differs by row.
    initialsById[p.id] = personInitials(personName(p));
  }

  // Every active employee with their FAST goals, laddered into the tree.
  const roster = (rosterRes.data ?? []) as unknown as RosterRow[];
  const teamGoals = (teamGoalsRes.data ?? []) as TeamGoalRow[];

  const krLabel = new Map(krs.map((kr) => [kr.id, kr.title] as const));
  const objLabel = new Map(objectives.map((o) => [o.id, o.title] as const));

  const ladderIndex = buildLadderIndex(objectives, allKrs, companyObjectiveIds);
  const memberByProfile = profileToMember(roster);

  // Members laddered to each KR, for the avatar stack on the KR row. One entry
  // per member per KR.
  const ladderedByKr: Record<string, LadderedPerson[]> = {};
  for (const g of teamGoals) {
    const krId = g.key_result_id;
    const m = krId ? memberByProfile.get(g.coaching_profile_id) : null;
    if (!krId || !m) continue;
    const list = (ladderedByKr[krId] ??= []);
    if (!list.some((x) => x.teamMemberId === m.teamMemberId)) list.push(m);
  }
  for (const list of Object.values(ladderedByKr)) list.sort((a, b) => a.name.localeCompare(b.name));

  // One flat list of resolved goals (only those owned by a roster member), then
  // both groupings derive from it.
  const resolved: ResolvedGoal[] = teamGoals.flatMap((g) => {
    const m = memberByProfile.get(g.coaching_profile_id);
    if (!m) return [];
    const ladder = g.key_result_id
      ? krLabel.get(g.key_result_id) ?? null
      : g.objective_id
        ? objLabel.get(g.objective_id) ?? null
        : null;
    return [{ ...m, goalTitle: g.title, ladder, objId: resolveCompanyObjectiveId(g, ladderIndex) }];
  });

  const byPerson = groupByPerson(roster, resolved);
  const withGoal = byPerson.filter((p) => p.goals.length > 0).length;
  const byObjective = groupByObjective(tree, resolved);
  const departmentById = new Map<string, string>();
  for (const tm of roster) {
    const d = one(tm.departments ?? null);
    if (d) departmentById.set(d.id, d.name);
  }
  const departments = [...departmentById].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  return { quarter: q, tree, initialsById, ladderedByKr, byPerson, byObjective, withGoal, departments };
}
