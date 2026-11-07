// The ladders tables' thin select helpers (LD.1). Each names a table and hands
// back the PostgREST builder, so the caller keeps its own columns and filters.
// The row types the callers narrow to live in rows.ts. Only this entity calls
// these: the door exports questions (myStanding, wornTiers), never a builder.
import { companyOs } from "@/kernel/data/supabase";

type Row = Record<string, unknown>;
type SelectOptions = { head?: boolean; count?: "exact" | "planned" | "estimated" };

export const selectLadderPositions = (columns: string, options?: SelectOptions) => companyOs.from("ladder_positions").select<string, Row>(columns, options);
export const selectLadderUnlocks = (columns: string, options?: SelectOptions) => companyOs.from("ladder_unlocks").select<string, Row>(columns, options);
export const selectLadderDisplay = (columns: string, options?: SelectOptions) => companyOs.from("ladder_display").select<string, Row>(columns, options);
