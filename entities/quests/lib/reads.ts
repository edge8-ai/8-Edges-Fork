// The quests tables' thin select helpers (QS.1). Each names a table and hands
// back the PostgREST builder, so the caller keeps its own columns and filters.
// The row types the callers narrow to live in rows.ts, derived from the
// generated Supabase types.
import { companyOs } from "@/kernel/data/supabase";

type Row = Record<string, unknown>;
type SelectOptions = { head?: boolean; count?: "exact" | "planned" | "estimated" };

export const selectQuests = (columns: string, options?: SelectOptions) => companyOs.from("quests").select<string, Row>(columns, options);
export const selectQuestHeads = (columns: string, options?: SelectOptions) => companyOs.from("quest_heads").select<string, Row>(columns, options);
export const selectQuestParty = (columns: string, options?: SelectOptions) => companyOs.from("quest_party").select<string, Row>(columns, options);
export const selectQuestReactions = (columns: string, options?: SelectOptions) => companyOs.from("quest_reactions").select<string, Row>(columns, options);
export const selectQuestHands = (columns: string, options?: SelectOptions) => companyOs.from("quest_hands").select<string, Row>(columns, options);
