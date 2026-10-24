// The ladders tables' thin write helpers (LD.1). A position is always upserted
// whole: nothing increments a stored number, so an event delivered twice, or
// out of order, writes the same rows. An unlock is inserted once and never
// again: the unique key (person, kind, key) and ignoreDuplicates make a replay
// that finds the same tier a no-op, and the column-level grant in the schema
// means nothing here could change an unlock's other columns, or delete one,
// even by mistake: only shown_at is ever updated (markShown, LD.5).
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { PositionInsert, UnlockInsert } from "./rows";

export const upsertLadderPositions = (rows: PositionInsert[]) => companyOs.from("ladder_positions").upsert(rows, { onConflict: "person_id,ladder" });
export const insertLadderUnlocks = (rows: UnlockInsert[]) => companyOs.from("ladder_unlocks").upsert(rows, { onConflict: "person_id,kind,key", ignoreDuplicates: true });
/**
 * The one update the unlocks table allows: when the person saw the rank-up or
 * the badge drop. The patch type names shown_at alone, as the column-level
 * grant does; the caller adds the filters that pin it to the reader's own row.
 */
export const updateLadderUnlocks = (patch: { shown_at: string }) => companyOs.from("ladder_unlocks").update(patch);
/** A person's own choices, upserted on their row; a column left out keeps its value, or its default on a new row. */
export const upsertLadderDisplay = (row: TablesInsert<{ schema: "company_os" }, "ladder_display">) => companyOs.from("ladder_display").upsert(row, { onConflict: "person_id" });
