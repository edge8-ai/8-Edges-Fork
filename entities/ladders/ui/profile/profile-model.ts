// The dressed profile as a page draws it (LD.6; spec "The profile page"; ADR
// 0021), and the two ways it is built: from the owner's own standing, which
// holds everything, and from what a teammate may see, which is wornTiers'
// profile answer and nothing more. Pure, so the audience rule is tested on
// values: a teammate's dress is built only from a WornProfile, which carries no
// division, star or point, and no stat or emblem its owner hid.
import type { ProfilePerson } from "@/kernel/shell/page-slots";
import { badgeById, type Rarity } from "../../lib/badges";
import { STAT_KEYS, type StatKey } from "../../lib/display-choices";
import type { BuilderCounts, BuilderTier, LearnShareCounts, LearnShareTier } from "../../lib/points";
import type { Banner } from "../../lib/rows";
import type { Standing } from "../../lib/standing";
import type { WornProfile } from "../../lib/worn";
import type { FoundBadge } from "./case-choices";
import { glyphOf, type Glyph } from "../badges/glyphs";

export type { ProfilePerson };

export type ProfileStat = { key: StatKey; value: number; shown: boolean };
/** A badge's art and story (LD.7b): its rarity, its glyph and its flavour, for the display case and the stickers. */
export type CaseArt = { rarity: Rarity; glyph: Glyph; flavour: string };
export type CaseBadge = { id: string; name: string; art?: CaseArt };

export type ProfileDress = {
  person: ProfilePerson;
  /** The viewer's own game style: off draws plain words and no art. */
  gameOn: boolean;
  banner: Banner;
  /** The Title worn under the name, or null. */
  title: string | null;
  /** The badge worn as that Title, which Customise's Title select starts on. */
  titleBadge: string | null;
  /**
   * The tier each emblem shows when worn. The owner's dress holds their tiers
   * whether worn or not, so a Show switch can put one on the plaque at once; a
   * teammate's holds only a worn tier, and null for one hidden.
   */
  emblems: { learnShare: { tier: LearnShareTier; worn: boolean } | null; builder: { tier: BuilderTier; worn: boolean } | null };
  /** The owner's dress holds all six, each shown or not; a teammate's only the shown ones. */
  stats: ProfileStat[];
  displayCase: CaseBadge[];
  /**
   * The badges the owner found (LD.7a), named, for Customise's Title select and
   * Add… slots; empty on a teammate's dress, which offers nothing.
   */
  found: FoundBadge[];
  /** The art of every badge the dress names (the case, and on the owner's dress every badge found), by id, so a badge added in Customise draws at once. */
  art: Record<string, CaseArt>;
};

/** A badge's name worn as a Title, without its tier numeral ("Fire keeper I" is worn as "Fire keeper"). */
export function titleOf(badgeId: string | null): string | null {
  if (!badgeId) return null;
  const badge = badgeById(badgeId);
  return badge ? (badge.family ?? badge.name) : null;
}

/** A badge's art, or undefined for an id the catalogue no longer holds. */
export function artOf(id: string): CaseArt | undefined {
  const badge = badgeById(id);
  return badge ? { rarity: badge.rarity, glyph: glyphOf(badge), flavour: badge.flavour } : undefined;
}

const caseOf = (ids: readonly string[]): CaseBadge[] => ids.map((id) => ({ id, name: badgeById(id)?.name ?? id, art: artOf(id) }));

const artFor = (ids: readonly string[]): Record<string, CaseArt> => Object.fromEntries(ids.flatMap((id) => { const art = artOf(id); return art ? [[id, art] as const] : []; }));

/** The owner's own dress, from their standing: everything, each choice as they made it. */
export function dressOwn(person: ProfilePerson, standing: Standing): ProfileDress {
  const d = standing.display;
  const ls = standing.learnShare.counts as LearnShareCounts;
  const b = standing.builder.counts as BuilderCounts;
  const values: Record<StatKey, number> = { hits: ls.hits, sparks: ls.sparks, fires: ls.fires, beacons: ls.beacons, cards: b.cards, humanTokens: b.humanTokens };
  return {
    person,
    gameOn: d.gameStyle,
    banner: d.banner,
    title: titleOf(d.titleBadge),
    titleBadge: d.titleBadge,
    emblems: {
      learnShare: { tier: standing.learnShare.tier as LearnShareTier, worn: d.wearLearnShare },
      builder: { tier: standing.builder.tier as BuilderTier, worn: d.wearBuilder },
    },
    stats: STAT_KEYS.map((key) => ({ key, value: values[key], shown: d.shownStats.includes(key) })),
    displayCase: caseOf(d.displayCase),
    found: standing.badgesFound.map((f) => ({ id: f.key, name: f.name, family: badgeById(f.key)?.family ?? f.name })),
    art: artFor([...d.displayCase, ...standing.badgesFound.map((f) => f.key)]),
  };
}

/**
 * A teammate's view of someone's dress, from wornTiers' profile answer and the
 * viewer's own game style. Only what the owner switched on is in it.
 */
export function dressTeammate(person: ProfilePerson, worn: WornProfile, gameOn: boolean): ProfileDress {
  return {
    person,
    gameOn,
    banner: worn.banner,
    title: titleOf(worn.titleBadge),
    titleBadge: worn.titleBadge,
    emblems: {
      learnShare: worn.learnShare ? { tier: worn.learnShare as LearnShareTier, worn: true } : null,
      builder: worn.builder ? { tier: worn.builder as BuilderTier, worn: true } : null,
    },
    stats: STAT_KEYS.flatMap((key) => (worn.stats[key] === undefined ? [] : [{ key, value: worn.stats[key] as number, shown: true }])),
    displayCase: caseOf(worn.displayCase),
    found: [],
    art: artFor(worn.displayCase),
  };
}
