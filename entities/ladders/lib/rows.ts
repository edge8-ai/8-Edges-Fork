// The ladders tables' rows as the entity reads and writes them (LD.1): the
// generated Supabase types, narrowed to the columns each read selects and to
// the entity's own unions where the database stores text. Deriving them from
// Tables and TablesInsert means a column the schema gains or loses shows up
// here as a type error, not as a drifted shape.
import type { Tables, TablesInsert } from "@/kernel/data/supabase/database.types";
import type { BuilderCounts, Ladder, LearnShareCounts, Tier } from "./points";

type CompanyOs = { schema: "company_os" };
type Narrow<Row, K extends keyof Row, N> = Omit<Pick<Row, K>, keyof N> & N;

export type UnlockKind = "tier" | "badge";
export type UnlockLadder = Ladder | "both";
export type UnlockSource = "event" | "replay" | "launch";
export type Banner = "meadow" | "dragon" | "hydra" | "lighthouse" | "photo";

/** The act counts behind a position, by ladder. */
export type Counts = LearnShareCounts | BuilderCounts;

export type PositionRow = Narrow<
  Tables<CompanyOs, "ladder_positions">,
  "person_id" | "ladder" | "points" | "tier" | "division" | "stars" | "immortal_band" | "counts" | "computed_at",
  { ladder: Ladder; tier: Tier; division: 1 | 2 | 3 | 4 | null; stars: 1 | 2 | 3 | 4 | 5 | null; immortal_band: 1 | 2 | 3 | null; counts: Counts }
>;

export type UnlockRow = Narrow<
  Tables<CompanyOs, "ladder_unlocks">,
  "id" | "person_id" | "kind" | "ladder" | "key" | "unlocked_at" | "source" | "shown_at",
  { kind: UnlockKind; ladder: UnlockLadder; source: UnlockSource }
> & {
  /**
   * The table of the row that proves a badge (LD.7b reads it to say on which
   * page a badge drops); null for a tier. Optional because no tier's reader
   * needs it, and a badge read without it drops nowhere and waits on the
   * Achievements tab.
   */
  witness_table?: string | null;
};

export type DisplayRow = Narrow<
  Tables<CompanyOs, "ladder_display">,
  "person_id" | "wear_learn_share" | "wear_builder" | "banner" | "title_badge" | "shown_stats" | "display_case" | "game_style",
  { banner: Banner }
>;

export type PositionInsert = Narrow<
  TablesInsert<CompanyOs, "ladder_positions">,
  "person_id" | "ladder" | "points" | "tier" | "division" | "stars" | "immortal_band" | "counts" | "computed_at",
  { ladder: Ladder; tier: Tier; division: 1 | 2 | 3 | 4 | null; stars: 1 | 2 | 3 | 4 | 5 | null; immortal_band: 1 | 2 | 3 | null; counts: Counts; computed_at: string }
>;

/**
 * An unlock as written. A tier names no witness; a badge names the row that
 * proves it (LD.7), both halves or neither, as the table's check requires.
 */
export type UnlockInsert = Narrow<
  TablesInsert<CompanyOs, "ladder_unlocks">,
  "person_id" | "kind" | "ladder" | "key" | "source" | "shown_at" | "witness_table" | "witness_id",
  { kind: UnlockKind; ladder: UnlockLadder; source: UnlockSource; shown_at: string | null; witness_table: string | null; witness_id: string | null }
>;

/** The columns each read selects, so the rows above and the queries cannot drift apart. */
export const POSITION_COLUMNS = "person_id, ladder, points, tier, division, stars, immortal_band, counts, computed_at";
export const UNLOCK_COLUMNS = "id, person_id, kind, ladder, key, unlocked_at, source, shown_at, witness_table";
export const DISPLAY_COLUMNS = "person_id, wear_learn_share, wear_builder, banner, title_badge, shown_stats, display_case, game_style";
