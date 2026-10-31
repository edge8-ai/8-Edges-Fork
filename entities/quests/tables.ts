// The Supabase tables the quests entity owns (QS.1, spec 2026-10-20, "Data").
// Nobody else writes them, and quests writes no table it does not own: a
// Raid's session is written through Training's door, never here.
//
// The list follows the applied schema, not the planned one: check:table-ownership
// refuses a declared table that neither the generated Supabase types nor any
// code knows, and the types are regenerated from production only after a
// migration is merged and applied (CLAUDE.md, "expand, then contract"). So the
// first expand shipped this empty, the use PR that regenerated the types filled
// in three, and quest_heads joined with the page PR once 20261020190000 was
// applied and the types regenerated again, and quest_hands with the QS.5 types
// PR once 20261021150000 was applied.
export const QUESTS_TABLES: readonly string[] = ["quest_hands", "quest_heads", "quest_party", "quest_reactions", "quests"];
