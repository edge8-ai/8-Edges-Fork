// Which badges drop where (LD.7b, QS.15b; the badges doc, section 5; ADR
// 0021). A badge drops on the page where the act that found it happened, to
// the person who did it, once: the table of its witness row says which page
// that was. A badge the nightly replay found, or one credited at the launch,
// drops nowhere; the replay's waits on the Achievements tab. Pure, so the
// rules are tested on values.
import type { BadgeDropPlace, LearnShareAct, QuestDropSpot } from "../../slots";
import type { WitnessTable } from "../../lib/badge-acts";
import { badgeById, type Badge } from "../../lib/badges";
import type { BadgeFound } from "../../lib/standing";
import type { Drop } from "./drop-answers";
import { glyphOf } from "./glyphs";

/** The witness tables each page's acts write. */
export const DROP_TABLES = {
  spark: ["ideas", "idea_reactions", "idea_builds"],
  board: ["tasks"],
  training: ["trainings", "training_attendance", "training_submissions", "training_reviews"],
} as const satisfies Record<BadgeDropPlace, readonly WitnessTable[]>;

/**
 * The witness tables the Quests page's own acts write: a quest posted or a
 * Raid hosted, a Turn-in or a seat, a Reaction given. Reactions are given on
 * the Quests page, so a badge a Reaction found (Tavern keeper, Kind for kind)
 * drops there with the Turn-ins.
 */
export const QUEST_DROP_TABLES = ["quests", "quest_party", "quest_reactions"] as const satisfies readonly WitnessTable[];

/** A found badge as a drop draws it, when it may drop at all: an act's, not yet seen, a badge the catalogue holds, proved by a row. */
function dropOf(f: BadgeFound): { badge: Badge; table: WitnessTable; drop: Drop } | null {
  if (f.shown || f.source !== "event" || !f.witnessTable) return null;
  const badge = badgeById(f.key);
  if (!badge) return null;
  return { badge, table: f.witnessTable, drop: { unlockId: f.id, id: badge.id, name: badge.name, rarity: badge.rarity, glyph: glyphOf(badge), flavour: badge.flavour } };
}

/** The reader's badges waiting to drop on this page, in catalogue order. */
export function dropsFor(found: readonly BadgeFound[], where: BadgeDropPlace): Drop[] {
  const tables: readonly WitnessTable[] = DROP_TABLES[where];
  return found.flatMap((f) => {
    const d = dropOf(f);
    return d && tables.includes(d.table) ? [d.drop] : [];
  });
}

/**
 * Where on the Quests page a badge drops: beside the act its rule counts (the
 * catalogue, badges.ts), one-offs by id and families by name. Its own table,
 * not the Lands for you rail's list (act-badges.ts): that one names only the
 * badges an act moves by itself, and a drop must also stand beside the act
 * that found a badge whose rule asks more of it (a Hydra's last head, a
 * dragon, a Beacon someone asked for). A badge a quest, a Turn-in or a
 * Reaction proves that is not here (Summoner, Tavern keeper, a mixed one like
 * Three paths) stands under Your next move. The Lore's composer posts a
 * one-line learning, so only the badges such a learning can find drop there;
 * Footnotes and Well read need sources it cannot add.
 */
export const QUEST_SPOTS: Readonly<Record<string, LearnShareAct>> = {
  // A Turn-in on a Bounty, or taking one up.
  "first-hit": "hit",
  Hunter: "hit",
  Scribe: "hit",
  "Hydra tamer": "hit",
  "all-heads-bow": "hit",
  "dragons-scale": "hit",
  bestiary: "hit",
  duel: "hit",
  "free-sword": "hit",
  // Hosting a fire, or a seat by one.
  "Fire keeper": "fire",
  "cold-fire-warm-hands": "fire",
  "seat-by-the-fire": "fire",
  // A Beacon lit.
  lighthouse: "beacon",
  "Keeper of the light": "beacon",
  "carried-the-flame": "beacon",
  // A learning shared from the Lore's composer.
  "spark-struck": "learning",
  "first-page": "learning",
  Lorewright: "learning",
};

/** The act on the Quests page a badge drops beside; null when it stands under Your next move. */
const spotOf = (badge: Badge): LearnShareAct | null => QUEST_SPOTS[badge.id] ?? (badge.family ? QUEST_SPOTS[badge.family] : undefined) ?? null;

/**
 * The reader's badge drop on the Quests page, and the spot it stands at
 * (QS.15b). A badge one of the page's own acts found (its witness is a quest,
 * a Turn-in or a seat, or a Reaction) stands beside that act (QUEST_SPOTS): a
 * hit's under the arena, a fire's under the Campfires heading, a Beacon's
 * under the horizon; any other under Your next move. A learning shared from
 * the Lore's composer is a Spark row, so the badges such a learning finds
 * drop by the composer as well as on Spark; whichever page draws one first
 * marks it seen, so it drops once. (Spark struck is found by a spark of
 * either kind; a build spark is posted on Spark, which draws its drop as the
 * page reloads.) Several at once that share an act stand together beside it;
 * several that span acts are one "n badges found" under Your next move
 * (section 5), which also keeps two open drops from saving the display case
 * over each other.
 */
export function questDropFor(found: readonly BadgeFound[]): { spot: QuestDropSpot; drops: Drop[] } | null {
  const mine = found.flatMap((f) => {
    const d = dropOf(f);
    if (!d) return [];
    const act = spotOf(d.badge);
    const byTheComposer = act === "learning" && d.table === "ideas";
    if (!(QUEST_DROP_TABLES as readonly WitnessTable[]).includes(d.table) && !byTheComposer) return [];
    const spot: QuestDropSpot = act ?? "other";
    return [{ spot, drop: d.drop }];
  });
  if (mine.length === 0) return null;
  const spots = new Set(mine.map((m) => m.spot));
  return { spot: spots.size === 1 ? mine[0].spot : "other", drops: mine.map((m) => m.drop) };
}
