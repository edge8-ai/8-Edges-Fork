// The question the team hub asks of the company strategy (A.67): which plan is
// the one being run. Until A.67 team read it through `selectStrategies`.
import { selectStrategies } from "../reads";
import type { StrategyRow } from "./edges-shared";

/** The newest year's strategy, as a list of at most one row: the plan /team/strategy shows. */
export async function latestStrategy() {
  const { data, error } = await selectStrategies("id, year, title, body_md").order("year", { ascending: false }).limit(1);
  return { data: data as StrategyRow[] | null, error };
}
