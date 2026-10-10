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
