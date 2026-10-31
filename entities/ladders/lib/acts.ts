// The owners' doors the ladders ask (LD.1, LD.7; ADR 0021). Ladders reads
// nothing of theirs directly; each door answers one question about what a
// person did. The doors are an interface so the recompute and the replay are
// tested on acts in memory.
//
// Each owner is asked once per recompute: the act facts (act-facts.ts) are
// the one record the points and the badges both count (A.76, A.77; ADR 0023).
import { questFactsOf, raidHostsOf, type QuestFacts } from "@/entities/quests";
import { trainingFactsOf, type TrainingFacts } from "@/entities/training";
import { sparkFactsOf, type SparkFacts } from "@/entities/ideas";
import { cardsFromSparks, shippedCardFactsOf, type ShippedCardFact, type SparkCardFact } from "@/entities/boards";

/**
 * The owners' doors the ladders ask, each batched by person or by the ids the
 * first answers name (lib/act-facts.ts).
 */
export type Doors = {
  questFactsOf(personIds: readonly string[]): Promise<Map<string, QuestFacts>>;
  raidHostsOf(trainingIds: readonly string[]): Promise<Map<string, string>>;
  sparkFactsOf(personIds: readonly string[]): Promise<Map<string, SparkFacts>>;
  shippedCardFactsOf(personIds: readonly string[]): Promise<Map<string, ShippedCardFact[]>>;
  cardsFromSparks(ideaIds: readonly string[]): Promise<SparkCardFact[]>;
  trainingFactsOf(personIds: readonly string[]): Promise<Map<string, TrainingFacts>>;
};

// The doors are read when this is called, never at module scope: an entity
// index may still be loading when this file is evaluated, and a door value
// read then is undefined (scripts/entity-door-load-order.test.mjs). Quests'
// door applies its own clock to a hosted Raid; the ladders pass it none.
export function liveDoors(): Doors {
  return { questFactsOf: (ids) => questFactsOf(ids), raidHostsOf, sparkFactsOf, shippedCardFactsOf, cardsFromSparks, trainingFactsOf };
}
