// The acts the badge rules count (LD.7), read out of a person's act facts,
// each with the row that witnesses it and when it happened. The catalogue's
// shared definitions live here once (HITS, SPARKS, FIRES, BEACONS, SHIPPED,
// LEAF), so every rule in badges.ts that counts hits counts the same hits,
// and so do the points: every act on both ladders is these rows counted
// (A.76, A.77; ADR 0023).
// Pure: nothing here reads a table or a clock, and the time an act carries
// only orders the witnesses.
//
// Every selector checks the standing or the kind it rests on, so a row that
// should never arrive (a Missed, a hand-back, a skip, a card set aside) still
// counts for nothing.
import type { ShippedCardFact } from "@/entities/boards";
import type { PartyFact } from "@/entities/quests";
import type { PersonActFacts } from "./act-facts";
import type { LearnShareCounts } from "./points";

/** The tables a badge's witness may name: an act's own row. */
export type WitnessTable =
  | "quest_party"
  | "quests"
  | "quest_reactions"
  | "ideas"
  | "idea_reactions"
  | "idea_builds"
  | "tasks"
  | "trainings"
  | "training_attendance"
  | "training_submissions"
  | "training_reviews";

export type Witness = { table: WitnessTable; id: string };

export type Act = Witness & { at: string };

export const act = (table: WitnessTable, row: { id: string; at: string }): Act => ({ table, id: row.id, at: row.at });

/** In the order the acts happened; ties by id, so the same facts always name the same witness. */
const ordered = (acts: readonly Act[]): Act[] => [...acts].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

/** The act that brought the count to n (1 is the first), or null below n. */
export const nth = (acts: readonly Act[], n: number): Act | null => ordered(acts)[n - 1] ?? null;

/** When every part is found, the latest of their acts; null when any part is missing. */
export function all(...parts: (Act | null)[]): Act | null {
  if (parts.some((p) => p === null)) return null;
  return ordered(parts as Act[]).at(-1) ?? null;
}

/** One act per distinct key (a key of null counts for nothing), the first of each, in order. */
export function firstPer<T>(rows: readonly T[], key: (row: T) => string | null, toAct: (row: T) => Act): Act[] {
  const keyed = rows.map((row) => ({ key: key(row), act: toAct(row) }));
  const keyOf = new Map(keyed.map((k) => [k.act, k.key]));
  const seen = new Map<string, Act>();
  for (const a of ordered(keyed.map((k) => k.act))) {
    const k = keyOf.get(a) ?? null;
    if (k !== null && !seen.has(k)) seen.set(k, a);
  }
  return [...seen.values()];
}

const turnedIn = (p: PartyFact): boolean => p.standing === "turned_in";
/** A party row that counts as a seat: accepted or turned in, never anything else. */
export const seated = (p: PartyFact): boolean => p.standing === "accepted" || p.standing === "turned_in";

// Learn & Share.
export const hitRows = (f: PersonActFacts): PartyFact[] => f.quests.party.filter((p) => turnedIn(p) && p.quest.kind === "bounty");
export const hits = (f: PersonActFacts): Act[] => hitRows(f).map((p) => act("quest_party", p));
export const beaconRows = (f: PersonActFacts): PartyFact[] => f.quests.party.filter((p) => turnedIn(p) && p.quest.kind === "beacon" && Boolean(p.turnInUrl));
/** Lit Beacons, one per quest (the catalogue's BEACONS is distinct by quest). */
export const beacons = (f: PersonActFacts): Act[] =>
  firstPer(
    beaconRows(f),
    (p) => p.quest.id,
    (p) => act("quest_party", p),
  );
/** The catalogue's SPARKS, shared with the points (spec, Acts and points): the person's ideas rows, either kind, not archived. */
export const sparkRows = (f: PersonActFacts) => f.sparks.sparks.filter((s) => !s.archived);
export const sparks = (f: PersonActFacts): Act[] => sparkRows(f).map((s) => act("ideas", s));
export const sparksOfKind = (f: PersonActFacts, kind: "build" | "learning"): Act[] => sparkRows(f).filter((s) => s.kind === kind).map((s) => act("ideas", s));
/**
 * Raids hosted and held: the catalogue's FIRES. Held is Quests' judgment
 * (ADR 0023): the session ended, was not cancelled, and someone other than
 * the Host attended. The ladders apply no clock of their own.
 */
export const fireRows = (f: PersonActFacts) => f.quests.hosted.filter((r) => r.held);
export const fires = (f: PersonActFacts): Act[] => fireRows(f).map((r) => act("quests", r.quest));
export const givenLive = (f: PersonActFacts) => f.quests.given.filter((q) => q.state !== "withdrawn");
export const reactionsGiven = (f: PersonActFacts): Act[] => f.quests.reactionsGiven.map((r) => act("quest_reactions", r));
export const raidSeats = (f: PersonActFacts): PartyFact[] => f.quests.party.filter((p) => seated(p) && p.quest.kind === "raid");

/** Hydras on which the person turned in on every head: the act on the last head found it. */
export function hydrasTamed(f: PersonActFacts, minHeads = 2): Act[] {
  const byQuest = new Map<string, PartyFact[]>();
  for (const p of hitRows(f)) byQuest.set(p.quest.id, [...(byQuest.get(p.quest.id) ?? []), p]);
  const out: Act[] = [];
  for (const rows of byQuest.values()) {
    const quest = rows[0].quest;
    if (quest.headIds.length < minHeads) continue;
    const heads = new Set(rows.map((r) => r.headId));
    if (!quest.headIds.every((h) => heads.has(h))) continue;
    const last = all(...rows.map((r) => act("quest_party", r)));
    if (last) out.push(last);
  }
  return out;
}

/** The marks the person gave on someone else's spark, of one kind; on learning sparks only when asked. */
export const marks = (f: PersonActFacts, kind: "held" | "trying" | "unstuck", learningOnly: boolean): Act[] =>
  f.sparks.marksGiven.filter((m) => m.kind === kind && m.sparkBy !== f.personId && (!learningOnly || m.sparkKind === "learning")).map((m) => act("idea_reactions", m));

// Builder.
/** The catalogue's SHIPPED: done, with its completion time, not archived. */
const shippedRows = (f: PersonActFacts): ShippedCardFact[] => f.cards.filter((c) => c.status === "done" && c.completedAt !== null && c.archivedAt === null);
export const shipped = (f: PersonActFacts, where: (c: ShippedCardFact) => boolean = () => true): Act[] => shippedRows(f).filter(where).map((c) => act("tasks", c));
const isLeaf = (c: ShippedCardFact): boolean => c.liveChildren === 0;
/** The catalogue's SHIPPED ∩ LEAF: the cards the Builder points count. */
export const leafRows = (f: PersonActFacts): ShippedCardFact[] => shippedRows(f).filter(isLeaf);
export const leaves = (f: PersonActFacts): Act[] => leafRows(f).map((c) => act("tasks", c));
/** A parent with at least `min` live children, none of them left open. */
export const wholeParent = (min: number) => (c: ShippedCardFact) => c.liveChildren >= min && c.openChildren === 0;
/** One card per distinct key among the shipped cards that pass, the first of each. */
export const shippedPer = (f: PersonActFacts, key: (c: ShippedCardFact) => string | null, where: (c: ShippedCardFact) => boolean = () => true): Act[] =>
  firstPer(shippedRows(f).filter(where), key, (c) => act("tasks", c));
export const MARKETING = new Set(["marketing_content", "marketing_campaign", "marketing_day"]);
/** The catalogue's \mmigrations?\M: the word migration or migrations, any case. */
export const NAMES_A_MIGRATION = /\bmigrations?\b/i;

/**
 * Learn & Share's acts, counted. A hit and a Beacon lit are each party row
 * (one per head turned in, and a Beacon's Turn-in with its link), a spark each
 * ideas row not archived, a fire each held Raid, so the points rest on the
 * rows the badges name.
 */
export function learnShareCounts(f: PersonActFacts): LearnShareCounts {
  return { hits: hitRows(f).length, sparks: sparkRows(f).length, fires: fireRows(f).length, beacons: beaconRows(f).length };
}
