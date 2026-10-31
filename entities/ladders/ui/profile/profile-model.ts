// The dressed profile as a page draws it (LD.6, redrawn LD.10; spec "The
// profile page"; ADR 0021), and the two ways it is built: from the owner's own standing, which
// holds everything, and from what a teammate may see, which is wornTiers'
// profile answer and nothing more. Pure, so the audience rule is tested on
// values: a teammate's dress is built only from a WornProfile, which carries no
// division, star or point, and no stat or emblem its owner hid.
import type { ProfilePerson } from "../../slots";
import { badgeById, type Rarity } from "../../lib/badges";
import { STAT_KEYS, type StatKey } from "../../lib/display-choices";
import { placeWords } from "../../lib/place-words";
import type { BuilderCounts, BuilderTier, LearnShareCounts, LearnShareTier, Tier } from "../../lib/points";
import type { LadderStanding, Standing } from "../../lib/standing";
import type { WornProfile } from "../../lib/worn";
import type { FoundBadge } from "./case-choices";
import { glyphOf, type Glyph } from "../badges/glyphs";

export type { ProfilePerson };

export type ProfileStat = { key: StatKey; value: number; shown: boolean };
/** A badge's art and story (LD.7b): its rarity, its glyph and its flavour, for the display case and the stickers. */
export type CaseArt = { rarity: Rarity; glyph: Glyph; flavour: string };
export type CaseBadge = { id: string; name: string; art?: CaseArt };

/**
 * The owner's own place on one ladder, as their rank card draws it: the tier
 * with its division or stars, the points, how far along the tier they are and
 * what comes next. Only the owner's dress carries it, because a division, a
 * star and a point are for the person alone (spec "The two ladders").
 */
export type RankDetail = {
  words: string;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  band: 1 | 2 | 3 | null;
  points: number;
  /** How far through the tier held, 0 to 100; 100 at an open top. */
  pct: number;
  next: { tier: Tier; tierName: string; start: number; toGo: number } | null;
};

export type ProfileDress = {
  person: ProfilePerson;
  /** The viewer's own game style: off, the page is the postcard view and draws no ladders. */
  gameOn: boolean;
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
  /** The owner's place on each ladder; null on a teammate's dress. */
  ranks: { learnShare: RankDetail; builder: RankDetail } | null;
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

/** One ladder's place as the owner's rank card draws it. */
export function rankDetail(s: LadderStanding): RankDetail {
  const span = s.next ? s.next.start - s.start : 0;
  const pct = s.next && span > 0 ? Math.max(0, Math.min(100, Math.round(((s.points - s.start) / span) * 100))) : 100;
  return { words: placeWords(s, true), stars: s.stars, band: s.immortalBand, points: s.shown, pct, next: s.next ? { ...s.next, toGo: Math.ceil(s.next.toGo) } : null };
}

/** The owner's own dress, from their standing: everything, each choice as they made it. */
export function dressOwn(person: ProfilePerson, standing: Standing): ProfileDress {
  const d = standing.display;
  const ls = standing.learnShare.counts as LearnShareCounts;
  const b = standing.builder.counts as BuilderCounts;
  const values: Record<StatKey, number> = { hits: ls.hits, sparks: ls.sparks, fires: ls.fires, beacons: ls.beacons, cards: b.cards, humanTokens: b.humanTokens };
  return {
    person,
    gameOn: d.gameStyle,
    title: titleOf(d.titleBadge),
    titleBadge: d.titleBadge,
    emblems: {
      learnShare: { tier: standing.learnShare.tier as LearnShareTier, worn: d.wearLearnShare },
      builder: { tier: standing.builder.tier as BuilderTier, worn: d.wearBuilder },
    },
    ranks: { learnShare: rankDetail(standing.learnShare), builder: rankDetail(standing.builder) },
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
    title: titleOf(worn.titleBadge),
    titleBadge: worn.titleBadge,
    emblems: {
      learnShare: worn.learnShare ? { tier: worn.learnShare as LearnShareTier, worn: true } : null,
      builder: worn.builder ? { tier: worn.builder as BuilderTier, worn: true } : null,
    },
    ranks: null,
    stats: STAT_KEYS.flatMap((key) => (worn.stats[key] === undefined ? [] : [{ key, value: worn.stats[key] as number, shown: true }])),
    displayCase: caseOf(worn.displayCase),
    found: [],
    art: artFor(worn.displayCase),
  };
}
