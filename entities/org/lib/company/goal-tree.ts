// The company half of the Company Goals view: this year's objectives and key
// results (org's rows), the initials of each key result's accountable person,
// the key results nobody has measured yet, and the year's pace. The team half,
// every member's FAST goals laddered into this tree, is coaching's question
// (entities/coaching/lib/goal-ladder.ts), because coaching owns `goals` and
// already depends on org; org reading goals would close a cycle (RS-09). The
// two Company Goals pages, /team/company-goals and /admin/company/goals, are
// route bodies and put both questions (A.88.4, ADR 0025).
import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import type { KrRow, ObjectiveRow } from "./edges-shared";
import type { ObjectiveWithKrs } from "./goal-shapes";
import { everyKeyResult, objectivesOfYear } from "./goals";
import { getNeverMeasuredKeyResults } from "./key-result-measured";
import { currentQuarter, personInitials } from "./edges-shared";
import { yearPacePct } from "./kr-progress";

export type CompanyGoalTree = {
  quarter: ReturnType<typeof currentQuarter>;
  /** Every objective this year, all levels: the company ones render, the lower ones feed the ladder. */
  objectives: ObjectiveRow[];
  /** Every key result, so a goal on a lower level's key result can climb to its company objective. */
  allKrs: KrRow[];
  /** The company-level objectives, each with this year's key results. */
  tree: ObjectiveWithKrs[];
  initialsById: Record<string, string>;
  // Company key results nobody has measured yet (K.78): they read "Not measured
  // yet" and stay out of their objective's percent (G.14).
  unmeasuredKrIds: string[];
  // Share of the goal year gone, 0-100: the pace marker on each bar.
  pacePct: number;
};

export async function getCompanyGoalTree(): Promise<CompanyGoalTree> {
  const q = currentQuarter();

  const [objRes, krRes] = await Promise.all([
    // All levels this year (company goals are set per year and reviewed each
    // quarter): company-level objectives render as cards, the lower levels
    // only feed the FAST-goal ladder rollup.
    objectivesOfYear(q.start.getFullYear()),
    everyKeyResult(),
  ]);

  const objectives = objRes.data ?? [];
  const allKrs = krRes.data ?? [];
  const objectiveIds = new Set(objectives.map((o) => o.id));
  const krs = allKrs.filter((kr) => objectiveIds.has(kr.objective_id));
  const companyObjectives = objectives.filter((o) => o.level === "company");
  const krsByObjective = new Map<string, KrRow[]>();
  for (const kr of krs) {
    krsByObjective.set(kr.objective_id, [...(krsByObjective.get(kr.objective_id) ?? []), kr]);
  }
  const tree: ObjectiveWithKrs[] = companyObjectives.map((o) => ({ ...o, krs: krsByObjective.get(o.id) ?? [] }));
  const unmeasured = await getNeverMeasuredKeyResults(tree.flatMap((o) => o.krs));

  const personIds = Array.from(new Set(tree.flatMap((o) => o.krs.map((kr) => kr.accountable_person_id))));
  const peopleRes = personIds.length
    ? await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", personIds)
    : { data: [] };
  const initialsById: Record<string, string> = {};
  for (const p of (peopleRes.data ?? []) as ({ id: string } & NamedPerson)[]) {
    // From the display name, Given + Family: full_name's order differs by row.
    initialsById[p.id] = personInitials(personName(p));
  }

  return {
    quarter: q,
    objectives,
    allKrs,
    tree,
    initialsById,
    unmeasuredKrIds: [...unmeasured],
    pacePct: yearPacePct(q.start.getFullYear()),
  };
}
