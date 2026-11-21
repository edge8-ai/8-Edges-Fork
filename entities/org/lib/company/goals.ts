// The questions other entities ask of the company's objectives and key results
// (A.67). Until A.67 the door handed out `selectObjectives` and
// `selectKeyResults`, and team, coaching, ideas and company-os each
// chose their own columns and order. Each question here names what it answers;
// the columns and the order (sort_order, then id, so equal sort orders break
// the same way everywhere) stay with org, which owns both tables.
import { selectKeyResults, selectObjectives } from "../reads";
import { KR_SELECT, OBJECTIVE_SELECT, type KrRow, type ObjectiveRow } from "./edges-shared";

/** Every objective of this year at every level except dropped ones, in order: the Company Goals roll-up. */
export async function objectivesOfYear(year: number) {
  const { data, error } = await selectObjectives(OBJECTIVE_SELECT).eq("year", year).neq("status", "dropped").order("sort_order").order("id");
  return { data: data as ObjectiveRow[] | null, error };
}

/** Every key result, in order: the Company Goals roll-up keeps the ones under this year's objectives. */
export async function everyKeyResult() {
  const { data, error } = await selectKeyResults(KR_SELECT).order("sort_order").order("id");
  return { data: data as KrRow[] | null, error };
}

export type LadderObjectiveOption = { id: string; title: string; level: string; year: number | null; status: string; sort_order: number };
export type LadderKeyResultOption = { id: string; title: string; objective_id: string | null; sort_order: number };

/** Every objective, any year or status, in order: the options a coaching goal can ladder to. */
export async function ladderObjectiveOptions() {
  const { data, error } = await selectObjectives("id, title, level, year, status, sort_order").order("sort_order").order("id");
  return { data: data as LadderObjectiveOption[] | null, error };
}

/** Every key result, in order: the options a coaching goal can ladder to. */
export async function ladderKeyResultOptions() {
  const { data, error } = await selectKeyResults("id, title, objective_id, sort_order").order("sort_order").order("id");
  return { data: data as LadderKeyResultOption[] | null, error };
}

/** One objective a goal ladders to, or null when it is gone. */
export async function ladderObjective(objectiveId: string) {
  const { data, error } = await selectObjectives("id, title, quarter, level").eq("id", objectiveId).maybeSingle();
  return { data: data as { id: string; title: string; quarter: string | null; level: string | null } | null, error };
}

export type KeyResultReading = {
  id: string;
  unit: string | null;
  current_value: number | null;
  target_value: number | null;
  direction: string | null;
};

/** One key result a goal ladders to, with its reading, or null when it is gone. */
export async function ladderKeyResult(keyResultId: string) {
  const { data, error } = await selectKeyResults("id, title, objective_id, unit, current_value, target_value, direction")
    .eq("id", keyResultId)
    .maybeSingle();
  return { data: data as (KeyResultReading & { title: string; objective_id: string | null }) | null, error };
}

/** The readings of these key results: the measure printed under each goal that lifts one. */
export async function keyResultReadings(keyResultIds: string[]) {
  const { data, error } = await selectKeyResults("id, unit, current_value, target_value, direction").in("id", keyResultIds);
  return { data: data as KeyResultReading[] | null, error };
}

export type KeyResultSummary = {
  id: string;
  title: string;
  current_value: number;
  target_value: number | null;
  unit: string | null;
  status: string;
};

/** These key results' titles, values and status: the team assistant's answer about a member's goals. */
export async function keyResultSummaries(keyResultIds: string[]) {
  const { data, error } = await selectKeyResults("id, title, current_value, target_value, unit, status").in("id", keyResultIds);
  return { data: data as KeyResultSummary[] | null, error };
}

/** Every key result's id and title, unordered: the key result picker on the issues board. */
export async function keyResultTitles() {
  const { data, error } = await selectKeyResults("id, title");
  return { data: data as { id: string; title: string }[] | null, error };
}

/** Every key result's delivery mix, unordered: the share of work each kind of seat delivers, on the cockpits. */
export async function keyResultDeliveryMixes() {
  const { data, error } = await selectKeyResults("delivery_mix");
  return { data: data as { delivery_mix: string | null }[] | null, error };
}
