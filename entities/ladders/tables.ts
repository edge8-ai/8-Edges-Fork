// The Supabase tables the ladders entity owns (LD.1, spec 2026-10-21, "Data").
// Nobody else reads or writes them (check:table-ownership), and ladders writes
// no table it does not own: it reads the acts behind the points through the
// quests, ideas, boards and training doors and never touches their rows.
export const LADDERS_TABLES: readonly string[] = ["ladder_display", "ladder_positions", "ladder_unlocks"];
