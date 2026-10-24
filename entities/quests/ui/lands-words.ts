// The words of Lands for you (QS.15; quests spec "Lands for you"; prototype
// version 10, the rail beside a section's heading), game or plain. Pure,
// beside lore-model.ts. Everything said comes from one act's Lands, which the
// ladders work out from the reader's own standing and catalogue and hand over
// through the learnShareStanding page slot: Quests writes no points, no tier
// and no badge name down itself.
//
// What it never says: rank or level (a place is a tier and its division), a
// rarity as a share of people (the catalogue's word only), a secret badge's
// name (the ladders never hand one over), "almost there", "only n more" or
// "behind". The points left to the next division are said as a distance from
// the place the act reaches, "25 to Gold I".
import type { Lands, LandsBadge, LearnSharePlace, RarityWord } from "@/kernel/shell/page-slots";

export type LandsRailWords = {
  label: string;
  only: string;
  points: string;
  pointsWord: string;
  before: string;
  after: string;
  /** Whether the act moves the reader to another place; when it does not, the rail says the place once, not "Gold III → Gold III". */
  moves: boolean;
  /** "new tier · the rank-up fills the screen", or how far is left after the act; null at the open top. */
  note: string | null;
  newTier: boolean;
  badges: { name: string; rarity: RarityWord; progress: string | null }[];
  /** "Title to wear: Fire keeper", with "· you have it" once held; null when the catalogue offers none. */
  title: { lead: string; name: string; held: string | null } | null;
};

export const LANDS_LABEL = "Lands for you";
export const LANDS_ONLY = "only you see this";
const NEW_TIER = { game: "new tier · the rank-up fills the screen", plain: "a new tier" };

/** The reader's own count toward a badge: "finds it" for a one-off this act finds, "1 of 5" otherwise, and nothing that urges; null with no exact count. */
export function progressWords(progress: LandsBadge["progress"]): string | null {
  if (progress === null) return null;
  if (progress.at <= 1) return "finds it";
  return `${progress.have} of ${progress.at}`;
}

/** The rail's words for one act, from where the reader stands now and what the act lands. */
export function landsRailWords(before: LearnSharePlace, lands: Lands, game: boolean): LandsRailWords {
  const style = game ? "game" : "plain";
  const note = lands.newTier ? NEW_TIER[style] : lands.left ? `${lands.left.points} to ${lands.left.to.words[style]}` : null;
  return {
    label: LANDS_LABEL,
    only: LANDS_ONLY,
    points: `+${lands.points}`,
    pointsWord: "points",
    before: before.words[style],
    after: lands.after.words[style],
    moves: before.words.game !== lands.after.words.game,
    note,
    newTier: lands.newTier,
    badges: lands.badges.map((b) => ({ name: b.name, rarity: b.rarity, progress: progressWords(b.progress) })),
    title: lands.title ? { lead: "Title to wear:", name: lands.title.name, held: lands.title.held ? "· you have it" : null } : null,
  };
}

/**
 * What drops where an act landed (QS.15): its points, and the new tier when
 * the act crossed into one ("New tier: Gold"), read from the act's Lands as it
 * stood when the reader acted, since the page's next read already holds the
 * new place. `pending` is said when the points land later than the act: a fire
 * earns its Host's points once someone sits down by it and it is held, so the
 * drop by a fire just lit says so rather than claim them now. With no Lands
 * (no ladders) nothing drops.
 */
export function dropWords(lands: Lands | null, game: boolean, pending: string | null = null): { points: string; tier: string | null } | null {
  if (!lands) return null;
  const points = game ? `+${lands.points}` : `+${lands.points} points`;
  if (pending) return { points: `${points} ${pending}`, tier: null };
  return { points, tier: lands.newTier ? `New tier: ${lands.after.tierName}` : null };
}
