// A person's acts, gathered from the four owners' doors (LD.1; ADR 0021): the
// Turn-ins and hosted Raids from Quests, each Raid's register from Training,
// the sparks from Ideas and the shipped cards from the board. Ladders reads
// nothing of theirs directly; each door answers one question about what a
// person did and judges nothing. The facts are shaped into what points.ts
// takes, and the doors are an interface so the recompute and the replay are
// tested on acts in memory.
import { questActsOf, questFactsOf, raidHostsOf, type QuestActs, type QuestFacts } from "@/entities/quests";
import { sessionRegisters, trainingFactsOf, type SessionRegister, type TrainingFacts } from "@/entities/training";
import { sparkFactsOf, sparksOf, type SparkAct, type SparkFacts } from "@/entities/ideas";
import { cardsFromSparks, shippedCardFactsOf, shippedCardsOf, type CardAct, type ShippedCardFact, type SparkCardFact } from "@/entities/boards";
import { NO_ACTS, type PersonActs, type RaidFact } from "./points";

/**
 * The owners' doors the ladders ask. The first four are the points' questions
 * (LD.1); the rest are the badges' (LD.7, lib/act-facts.ts), each batched by
 * person or by the ids the first answers name.
 */
export type Doors = {
  questActsOf(personIds: readonly string[]): Promise<Map<string, QuestActs>>;
  sessionRegisters(trainingIds: readonly string[]): Promise<Map<string, SessionRegister>>;
  sparksOf(personIds: readonly string[]): Promise<Map<string, SparkAct[]>>;
  shippedCardsOf(personIds: readonly string[]): Promise<Map<string, CardAct[]>>;
  questFactsOf(personIds: readonly string[]): Promise<Map<string, QuestFacts>>;
  raidHostsOf(trainingIds: readonly string[]): Promise<Map<string, string>>;
  sparkFactsOf(personIds: readonly string[]): Promise<Map<string, SparkFacts>>;
  shippedCardFactsOf(personIds: readonly string[]): Promise<Map<string, ShippedCardFact[]>>;
  cardsFromSparks(ideaIds: readonly string[]): Promise<SparkCardFact[]>;
  trainingFactsOf(personIds: readonly string[]): Promise<Map<string, TrainingFacts>>;
};

// The doors are read when this is called, never at module scope: an entity
// index may still be loading when this file is evaluated, and a door value
// read then is undefined (scripts/entity-door-load-order.test.mjs).
export function liveDoors(): Doors {
  return { questActsOf, sessionRegisters, sparksOf, shippedCardsOf, questFactsOf, raidHostsOf, sparkFactsOf, shippedCardFactsOf, cardsFromSparks, trainingFactsOf };
}

/** Every person's acts, one call per door however many people are asked about. */
export async function gatherActs(personIds: readonly string[], doors: Doors = liveDoors()): Promise<Map<string, PersonActs>> {
  const [quests, sparks, cards] = await Promise.all([doors.questActsOf(personIds), doors.sparksOf(personIds), doors.shippedCardsOf(personIds)]);
  const trainingIds = [...new Set([...quests.values()].flatMap((q) => q.raids.map((r) => r.trainingId)).filter((id): id is string => id !== null))];
  const registers = trainingIds.length > 0 ? await doors.sessionRegisters(trainingIds) : new Map<string, SessionRegister>();
  const out = new Map<string, PersonActs>();
  for (const personId of personIds) {
    const q = quests.get(personId);
    const raids: RaidFact[] = (q?.raids ?? []).map((r) => {
      const register = r.trainingId ? registers.get(r.trainingId) : undefined;
      // A Raid with no session, or whose session Training no longer knows, was not held.
      return { hostId: personId, held: register?.held ?? false, selfLogged: register?.selfLogged ?? false, attended: register?.attended ?? [] };
    });
    out.set(personId, {
      ...NO_ACTS,
      turnIns: q?.turnIns ?? [],
      raids,
      sparks: sparks.get(personId) ?? [],
      cards: cards.get(personId) ?? [],
    });
  }
  return out;
}
