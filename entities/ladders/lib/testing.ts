// In-memory doors and store for the ladders tests (LD.1): the recompute, the
// replay and the two reads run against these exactly as they run against
// Supabase, so a test plays acts in the glossary's words and asserts what the
// person, a teammate and everyone else can read. Imported by test files only.
import type { Doors } from "./acts";
import type { DisplayRow, PositionRow, UnlockInsert, UnlockRow } from "./rows";
import { countKeys, type Store } from "./store";
import type { QuestFacts } from "@/entities/quests";
import type { TrainingFacts } from "@/entities/training";
import type { SparkFacts } from "@/entities/ideas";
import type { ShippedCardFact, SparkCardFact } from "@/entities/boards";

export type MemoryActs = {
  /** The act facts (LD.7), by person, and the Host of each Raid by session: the one record the points and the badges count. A hosted Raid comes judged, as Quests hands it over. */
  questFacts?: Record<string, QuestFacts>;
  sparkFacts?: Record<string, SparkFacts>;
  cardFacts?: Record<string, ShippedCardFact[]>;
  sparkCards?: SparkCardFact[];
  trainingFacts?: Record<string, TrainingFacts>;
  raidHosts?: Record<string, string>;
};

const NO_QUEST_FACTS: QuestFacts = { party: [], given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] };
const NO_SPARK_FACTS: SparkFacts = { sparks: [], marksGiven: [], buildNotes: [], heldReceived: [] };
const NO_TRAINING_FACTS: TrainingFacts = { attended: [], submissions: [], reviews: [], recaps: [], selfLogged: [] };

/** Doors that answer from the acts given; each call is counted so a test can see one read per door. */
export function memoryDoors(acts: MemoryActs): Doors & { calls: Record<keyof Doors, number> } {
  const calls: Record<keyof Doors, number> = {
    questFactsOf: 0,
    raidHostsOf: 0,
    sparkFactsOf: 0,
    shippedCardFactsOf: 0,
    cardsFromSparks: 0,
    trainingFactsOf: 0,
  };
  return {
    async questFactsOf(ids) {
      calls.questFactsOf += 1;
      return new Map(ids.map((id) => [id, acts.questFacts?.[id] ?? NO_QUEST_FACTS]));
    },
    async raidHostsOf(ids) {
      calls.raidHostsOf += 1;
      return new Map(ids.flatMap((id) => (acts.raidHosts?.[id] ? [[id, acts.raidHosts[id]] as const] : [])));
    },
    async sparkFactsOf(ids) {
      calls.sparkFactsOf += 1;
      return new Map(ids.map((id) => [id, acts.sparkFacts?.[id] ?? NO_SPARK_FACTS]));
    },
    async shippedCardFactsOf(ids) {
      calls.shippedCardFactsOf += 1;
      return new Map(ids.map((id) => [id, acts.cardFacts?.[id] ?? []]));
    },
    async cardsFromSparks(ideaIds) {
      calls.cardsFromSparks += 1;
      return (acts.sparkCards ?? []).filter((c) => ideaIds.includes(c.ideaId));
    },
    async trainingFactsOf(ids) {
      calls.trainingFactsOf += 1;
      return new Map(ids.map((id) => [id, acts.trainingFacts?.[id] ?? NO_TRAINING_FACTS]));
    },
    calls,
  };
}

/** An unlock as the table holds it, witness included. */
export type StoredUnlock = UnlockRow & Pick<UnlockInsert, "witness_table" | "witness_id">;

export type MemoryStore = Store & { positions: PositionRow[]; unlocks: StoredUnlock[]; display: DisplayRow[] };

/** A store over three arrays, with the same keys and the same never-twice rule as the tables. */
export function memoryStore(seed: { positions?: PositionRow[]; unlocks?: UnlockRow[]; display?: DisplayRow[] } = {}): MemoryStore {
  const store: MemoryStore = {
    positions: [...(seed.positions ?? [])],
    unlocks: (seed.unlocks ?? []).map((u) => ({ witness_table: null, witness_id: null, ...u })),
    display: [...(seed.display ?? [])],
    async positionsOf(ids) {
      return store.positions.filter((r) => ids.includes(r.person_id));
    },
    async unlocksOf(ids) {
      return store.unlocks.filter((r) => ids.includes(r.person_id));
    },
    async displayOf(ids) {
      return store.display.filter((r) => ids.includes(r.person_id));
    },
    async peopleWithRows() {
      return [...new Set([...store.positions, ...store.unlocks].map((r) => r.person_id))];
    },
    async anyUnlock(kind) {
      return store.unlocks.some((u) => !kind || u.kind === kind);
    },
    async badgeHolders() {
      // The same rule as the live store: the people are those with a Learn & Share position.
      return { holders: countKeys(store.unlocks.filter((u) => u.kind === "badge")), people: store.positions.filter((p) => p.ladder === "learn_share").length };
    },
    async writePositions(rows) {
      for (const row of rows) {
        const i = store.positions.findIndex((p) => p.person_id === row.person_id && p.ladder === row.ladder);
        const stored = { ...row } as PositionRow;
        if (i >= 0) store.positions[i] = stored;
        else store.positions.push(stored);
      }
    },
    async writeUnlocks(rows) {
      for (const row of rows) {
        if (store.unlocks.some((u) => u.person_id === row.person_id && u.kind === row.kind && u.key === row.key)) continue;
        store.unlocks.push({ id: `u${store.unlocks.length + 1}`, unlocked_at: "2026-10-21T19:00:00Z", ...row });
      }
    },
  };
  return store;
}

export const display = (over: Partial<DisplayRow> & { person_id: string }): DisplayRow => ({
  wear_learn_share: false,
  wear_builder: false,
  banner: "meadow",
  title_badge: null,
  shown_stats: [],
  display_case: [],
  game_style: true,
  ...over,
});
