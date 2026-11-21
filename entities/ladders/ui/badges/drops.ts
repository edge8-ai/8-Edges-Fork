// Which badges drop where (LD.7b; the badges doc, section 5; ADR
// 0021). A badge drops on the page where the act that found it happened, to
// the person who did it, once: the table of its witness row says which page
// that was. A badge the nightly replay found, or one credited at the launch,
// drops nowhere; the replay's waits on the Achievements tab. Pure, so the
// rules are tested on values.
import type { BadgeDropPlace } from "../../slots";
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
