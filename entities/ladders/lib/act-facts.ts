// A person's act facts, the record the badge rules read (LD.7; spec "Badges
// as data"; ADR 0021), and every act the points count too (A.76, A.77; ADR
// 0023).
// Gathered from the four owners' doors, each asked once for everyone in the
// batch: Quests (party rows accepted or turned in, quests given, the Raids
// hosted with each judged held or not, Reactions), Ideas (sparks, marks and
// build notes given, "it held" received), the board (shipped cards with what the badges ask of
// each, and the cards picked up from the person's sparks) and Training
// (sessions attended, submissions, reviews, recaps, self-logged trainings),
// plus the Host of each Raid the person sat in. Ladders reads none of their
// tables. Each door answers what a person did; the one judgment any of them
// makes is Quests' held fire, which needs a clock, and Ladders has none. The
// two ladders' points and held tiers, which the crossover badges read, come
// from the recompute that called this.
//
// What no door is ever asked, so no rule can rest on it: a party row handed
// back, called and left, or missed; a skip; a card set aside; a review's
// stars; any clock of the ladders' own. A fact's `at` orders the witnesses
// (the act that crossed a threshold is the one named) and is read by no rule.
import type { QuestFacts } from "@/entities/quests";
import type { SparkFacts } from "@/entities/ideas";
import type { ShippedCardFact, SparkCardFact } from "@/entities/boards";
import type { TrainingFacts } from "@/entities/training";
import type { Doors } from "./acts";
import type { Tier } from "./points";

/** What the two ladders say of the person after this recompute: the crossover badges' facts. */
export type LadderFacts = { learnSharePoints: number; builderPoints: number; learnShare: Tier; builder: Tier };

export type PersonActFacts = {
  personId: string;
  quests: QuestFacts;
  sparks: SparkFacts;
  cards: readonly ShippedCardFact[];
  /** Done cards picked up from the person's sparks, whoever shipped them. */
  sparkCards: readonly SparkCardFact[];
  training: TrainingFacts;
  /** For each session the person attended that is a Raid, its Host. */
  raidHosts: ReadonlyMap<string, string>;
  ladders: LadderFacts;
};

export const NO_LADDERS: LadderFacts = { learnSharePoints: 0, builderPoints: 0, learnShare: "iron", builder: "herald" };

/** A person with no acts at all: what a fact the doors did not answer about defaults to. */
export function noFacts(personId: string, ladders: LadderFacts = NO_LADDERS): PersonActFacts {
  return {
    personId,
    quests: { party: [], given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] },
    sparks: { sparks: [], marksGiven: [], buildNotes: [], heldReceived: [] },
    cards: [],
    sparkCards: [],
    training: { attended: [], submissions: [], reviews: [], recaps: [], selfLogged: [] },
    raidHosts: new Map(),
    ladders,
  };
}

const unique = (ids: Iterable<string>): string[] => [...new Set(ids)];

/**
 * Every person's act facts: one call per door question however many people
 * are asked about. `ladders` carries each person's points and held tiers from
 * the recompute; a person missing from it is at the bottom of both.
 */
export async function gatherActFacts(personIds: readonly string[], doors: Doors, ladders: ReadonlyMap<string, LadderFacts> = new Map()): Promise<Map<string, PersonActFacts>> {
  const out = new Map<string, PersonActFacts>();
  if (personIds.length === 0) return out;
  const [quests, sparks, cards, training] = await Promise.all([doors.questFactsOf(personIds), doors.sparkFactsOf(personIds), doors.shippedCardFactsOf(personIds), doors.trainingFactsOf(personIds)]);
  const attended = unique([...training.values()].flatMap((t) => t.attended.map((a) => a.trainingId)));
  const sparkIds = unique([...sparks.values()].flatMap((s) => s.sparks.map((x) => x.id)));
  const [hosts, sparkCards] = await Promise.all([
    attended.length > 0 ? doors.raidHostsOf(attended) : Promise.resolve(new Map<string, string>()),
    sparkIds.length > 0 ? doors.cardsFromSparks(sparkIds) : Promise.resolve([] as SparkCardFact[]),
  ]);
  for (const personId of personIds) {
    const base = noFacts(personId, ladders.get(personId) ?? NO_LADDERS);
    const q = quests.get(personId) ?? base.quests;
    const s = sparks.get(personId) ?? base.sparks;
    const t = training.get(personId) ?? base.training;
    const mine = new Set(s.sparks.map((x) => x.id));
    const raidHosts = new Map<string, string>();
    for (const a of t.attended) {
      const host = hosts.get(a.trainingId);
      if (host) raidHosts.set(a.trainingId, host);
    }
    out.set(personId, {
      ...base,
      quests: q,
      sparks: s,
      cards: cards.get(personId) ?? [],
      sparkCards: sparkCards.filter((c) => mine.has(c.ideaId)),
      training: t,
      raidHosts,
    });
  }
  return out;
}
