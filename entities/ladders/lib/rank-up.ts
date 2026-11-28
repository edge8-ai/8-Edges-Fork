// Which rank-up to show, and what it says (LD.5; spec "The rank-up"; ADR
// 0021). A waiting tier unlock is a rank-up nobody has seen yet; this picks the
// one to show now from the reader's own standing and words it. It is pure, so
// the choice is tested on a standing in memory.
//
// The words are the approved prototype's (the Ladders artifact, v5): the tier's
// name, the ladder with the division or star the tier opens at ("Learn & Share
// · Gold IV", "Builder · Archon ★"), and one line of praise per ladder. With
// the reader's game style off, the same moment in plain words: no game nouns
// in the praise, and the place said as the Your ladders panel says it plainly.
import { LADDER_WORDS, placeOn, tierIndex, tierStart, type Ladder, type Tier } from "./points";
import { placeWords } from "./place-words";
import type { Standing, WaitingUnlock } from "./standing";

/** One rank-up, ready to show: what the screen draws and the unlocks it marks shown. */
export type RankUp = {
  unlockId: string;
  /**
   * Every waiting tier on this ladder at or below the one shown, the shown one
   * included: one act that crossed several tiers is one screen, and the tiers
   * beneath it are seen with it, so a lower tier never opens after a higher
   * one (spec: "several tiers at once show the highest").
   */
  markIds: string[];
  ladder: Ladder;
  tier: Tier;
  tierName: string;
  /** Immortal's medal, for the art; null on every other tier. */
  band: 1 | 2 | 3 | null;
  /** The ladder and the place the tier opens at, "Learn & Share · Gold IV". */
  place: string;
  /** The line of praise. */
  praise: string;
  /** The reader's game style: off draws no art and moves nothing. */
  gameOn: boolean;
};

/**
 * The line of praise, verbatim from the prototype with the tier's name in
 * place of Gold. The prototype wrote one line per ladder; the plain style says
 * the Learn & Share line with Quests' plain nouns (an answer for a hit, a
 * session held for a fire) and drops the forge from the Builder one.
 */
export function praiseFor(ladder: Ladder, tierName: string, gameOn: boolean): string {
  if (ladder === "learn_share") {
    return gameOn
      ? `Every hit, every spark, every fire you lit added up. ${tierName} suits you.`
      : `Every answer, every spark, every session you held added up. ${tierName} suits you.`;
  }
  return gameOn ? "Real work, shipped and landed. The forge hands you a new medal." : `Real work, shipped and landed. ${tierName} is yours.`;
}

const at = (u: WaitingUnlock): number => Date.parse(u.unlockedAt);

/**
 * The rank-up to show now, or null. Only a climb opens one: the bottom tier
 * (Iron, Herald) is where everyone starts, so its unlock, written on a
 * person's first act, is no rank-up (shapeStanding already leaves it out of
 * `waiting`; the check here keeps this pure function honest on any input). On
 * each ladder the highest tier waiting shows; between the two ladders, the one
 * reached last (where the act landed), Learn & Share first on a tie. Answering
 * marks the shown tier and every waiting tier beneath it on that ladder, so one
 * climb is one screen; a tier waiting on the other ladder shows on a later
 * render.
 */
export function pickRankUp(standing: Standing): RankUp | null {
  const top = new Map<Ladder, WaitingUnlock>();
  for (const u of standing.waiting) {
    if (tierIndex(u.ladder, u.tier) === 0) continue;
    const held = top.get(u.ladder);
    if (!held || tierIndex(u.ladder, u.tier) > tierIndex(u.ladder, held.tier)) top.set(u.ladder, u);
  }
  const [chosen] = [...top.values()].sort((a, b) => at(b) - at(a) || (a.ladder === b.ladder ? 0 : a.ladder === "learn_share" ? -1 : 1));
  if (!chosen) return null;
  const gameOn = standing.display.gameStyle;
  // The place the tier opens at for the reader: where they stand now when it
  // is the tier they hold (a big act can land past its first division), and
  // the tier's own first division or star when a higher one has since been
  // reached and this one shows late.
  const now = chosen.ladder === "learn_share" ? standing.learnShare : standing.builder;
  const place = now.tier === chosen.tier ? now : placeOn(chosen.ladder, tierStart(chosen.ladder, chosen.tier));
  const chosenIndex = tierIndex(chosen.ladder, chosen.tier);
  const markIds = standing.waiting.filter((u) => u.ladder === chosen.ladder && tierIndex(u.ladder, u.tier) <= chosenIndex && tierIndex(u.ladder, u.tier) > 0).map((u) => u.id);
  return {
    unlockId: chosen.id,
    markIds,
    ladder: chosen.ladder,
    tier: chosen.tier,
    tierName: chosen.tierName,
    band: chosen.tier === "immortal" ? (place.immortalBand ?? 1) : null,
    // A band is the owner's own detail of Immortal; the moment names the tier.
    place: `${LADDER_WORDS[chosen.ladder]} · ${placeWords({ tierName: chosen.tierName, division: place.division, stars: place.stars, immortalBand: null }, gameOn)}`,
    praise: praiseFor(chosen.ladder, chosen.tierName, gameOn),
    gameOn,
  };
}
