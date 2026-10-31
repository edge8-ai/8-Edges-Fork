import { selectCoreValues } from "./reads";
import type { ValueRow } from "./core-values";

// Both Core Values pages read through here. Null means the read failed, which
// is logged and shown as an error state: the old pages turned a failure into
// "No values yet. Add the first one.", which invited an admin to add duplicates.
export async function loadCoreValues(): Promise<ValueRow[] | null> {
  const { data, error } = await selectCoreValues("id, sort_order, title, description").order("sort_order");
  if (error) {
    console.error("[org/core-values] core_values", error.message);
    return null;
  }
  return (data ?? []) as ValueRow[];
}

// The questions other entities ask of the core values (A.67). Until A.67 the
// door handed out `selectCoreValues` and hiring and coaching chose
// their own columns; the values are org's, so the reads live here.

/** Every value's title and description, in the company's order: what an interview scorecard is judged against. */
export async function coreValuesForScorecard() {
  const { data, error } = await selectCoreValues("title, description").order("sort_order", { ascending: true });
  return { data: data as { title: string; description: string | null }[] | null, error };
}

/** The titles of these values: the tags on a coach's noticed sentences. */
export async function coreValueTitles(valueIds: string[]) {
  const { data, error } = await selectCoreValues("id, title").in("id", valueIds);
  return { data: data as { id: string; title: string }[] | null, error };
}

/** Every value a coach may tag a sentence with, in the company's order. */
export async function taggableCoreValues() {
  const { data, error } = await selectCoreValues("id, title, sort_order").order("sort_order");
  return { data: data as { id: string; title: string; sort_order: number }[] | null, error };
}
