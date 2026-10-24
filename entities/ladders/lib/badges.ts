// Badges as data (LD.7; spec "Badges as data"; ADR 0021; the catalogue,
// docs/engineering/2026-10-21-ladders-badges.md). Every ready badge of the
// catalogue is a definition: its words (badge-catalogue.ts, in the
// catalogue's order and spelling) and the rule that finds it, a pure function
// over a person's act facts (act-facts.ts). A rule reads no table, no clock
// and nobody else's total: it is handed what one person did, and says whether
// that finds the badge and which row proves it (the witness). The table test
// (badges.test.ts) is the gate: a row per badge that finds it, and the five
// rules' negative rows.
//
// The witness is the act that found the badge: for a family tier, the act
// that brought the count to the threshold, in the order the acts happened;
// for a badge made of several acts, the latest of them. A badge whose proof is
// a ladder's tier (Twin crowns) names no row, which the table allows.
//
// What a rule never reads, because no door hands it over: a Turn-in that was
// handed back, called and left, or missed; a skip; a card set aside; a
// review's stars; a time. The rules also check the standing and the kind they
// rest on, so a row that should never arrive still finds nothing.
import type { PersonActFacts } from "./act-facts";
import {
  MARKETING,
  NAMES_A_MIGRATION,
  act,
  all,
  beaconRows,
  beacons,
  fireRows,
  fires,
  firstPer,
  givenLive,
  hitRows,
  hits,
  hydrasTamed,
  leaves,
  marks,
  nth,
  raidSeats,
  reactionsGiven,
  seated,
  shipped,
  shippedPer,
  sparks,
  sparkRows,
  sparksOfKind,
  wholeParent,
  type Act,
  type Witness,
} from "./badge-acts";
import type { RarityWord } from "@/kernel/shell/page-slots";
import { CATALOGUE } from "./badge-catalogue";
import { tierIndex } from "./points";

/** The catalogue's rarity word, the one the Lands for you rail shows (kernel/shell/page-slots.ts names it for the page). */
export type Rarity = RarityWord;
export type BadgeGroup = "family" | "one-off" | "crossover" | "secret";
export type BadgeLadder = "learn_share" | "builder" | "both";

/** A badge's words, as the catalogue gives them. */
export type BadgeEntry = {
  id: string;
  name: string;
  group: BadgeGroup;
  /** The family a tier belongs to; null for a one-off. */
  family: string | null;
  tier: 1 | 2 | 3 | 4 | null;
  ladder: BadgeLadder;
  rarity: Rarity;
  /** The unlock rule in plain words: the locked tile's "Found by:" line. Never shown for a secret badge. */
  unlock: string;
  flavour: string;
  icon: string;
  /** A secret badge's hint while it is hidden; null for every other badge. */
  hint: string | null;
};

/** What a rule answers when the facts find the badge. */
export type Found = { witness: Witness | null };

export type Badge = BadgeEntry & {
  secret: boolean;
  /** The Title the badge offers: its name without its tier numeral. */
  title: string;
  /** The rule. Pure: the facts in, the badge found (with its witness) or null. */
  find(facts: PersonActFacts): Found | null;
  /** A family tier's count, for the owner's locked tile ("You have 7. This one is found at 10."). */
  count?: { of(facts: PersonActFacts): number; at: number };
};

const found = (a: Act | null | undefined): Found | null => (a ? { witness: { table: a.table, id: a.id } } : null);
// ---------------------------------------------------------------------------
// The rules, by badge id.
// ---------------------------------------------------------------------------

type Rule = Pick<Badge, "find" | "count">;

/** A family tier: the act that brought the count to the threshold finds it. */
const atLeast = (n: number, acts: (f: PersonActFacts) => Act[]): Rule => ({ find: (f) => found(nth(acts(f), n)), count: { of: (f) => acts(f).length, at: n } });
/** A one-off: the first act that matches finds it. */
const any = (acts: (f: PersonActFacts) => Act[]): Rule => ({ find: (f) => found(nth(acts(f), 1)) });
/** Several acts: when all are found, the latest finds it. */
const each = (...parts: ((f: PersonActFacts) => Act | null)[]): Rule => ({ find: (f) => found(all(...parts.map((p) => p(f)))) });
const firstOf = (acts: (f: PersonActFacts) => Act[]) => (f: PersonActFacts) => nth(acts(f), 1);

const RULES: Record<string, Rule> = {
  // Learn & Share families.
  "hunter-i": atLeast(3, hits),
  "hunter-ii": atLeast(10, hits),
  "hunter-iii": atLeast(30, hits),
  "hunter-iv": atLeast(100, hits),
  "lorewright-i": atLeast(3, (f) => sparksOfKind(f, "learning")),
  "lorewright-ii": atLeast(10, (f) => sparksOfKind(f, "learning")),
  "lorewright-iii": atLeast(30, (f) => sparksOfKind(f, "learning")),
  "lorewright-iv": atLeast(100, (f) => sparksOfKind(f, "learning")),
  "stargazer-i": atLeast(3, (f) => sparksOfKind(f, "build")),
  "stargazer-ii": atLeast(10, (f) => sparksOfKind(f, "build")),
  "stargazer-iii": atLeast(30, (f) => sparksOfKind(f, "build")),
  "summoner-i": atLeast(3, (f) => givenLive(f).map((q) => act("quests", q))),
  "summoner-ii": atLeast(10, (f) => givenLive(f).map((q) => act("quests", q))),
  "summoner-iii": atLeast(30, (f) => givenLive(f).map((q) => act("quests", q))),
  "tavern-keeper-i": atLeast(3, reactionsGiven),
  "tavern-keeper-ii": atLeast(10, reactionsGiven),
  "tavern-keeper-iii": atLeast(30, reactionsGiven),
  "fire-keeper-i": atLeast(1, fires),
  "fire-keeper-ii": atLeast(5, fires),
  "fire-keeper-iii": atLeast(20, fires),
  "fire-keeper-iv": atLeast(50, fires),
  "keeper-of-the-light-i": atLeast(3, beacons),
  "keeper-of-the-light-ii": atLeast(10, beacons),
  "keeper-of-the-light-iii": atLeast(25, beacons),
  "hydra-tamer-i": atLeast(1, (f) => hydrasTamed(f)),
  "hydra-tamer-ii": atLeast(3, (f) => hydrasTamed(f)),
  "hydra-tamer-iii": atLeast(10, (f) => hydrasTamed(f)),
  "scribe-i": atLeast(1, (f) => hitRows(f).filter((p) => p.quest.learning).map((p) => act("quest_party", p))),
  "scribe-ii": atLeast(5, (f) => hitRows(f).filter((p) => p.quest.learning).map((p) => act("quest_party", p))),
  "scribe-iii": atLeast(20, (f) => hitRows(f).filter((p) => p.quest.learning).map((p) => act("quest_party", p))),
  "tried-and-true-i": atLeast(1, (f) => marks(f, "held", true)),
  "tried-and-true-ii": atLeast(5, (f) => marks(f, "held", true)),
  "tried-and-true-iii": atLeast(20, (f) => marks(f, "held", true)),

  // Learn & Share one-offs.
  "first-hit": any(hits),
  "spark-struck": any(sparks),
  "first-page": any((f) => sparksOfKind(f, "learning")),
  "seat-by-the-fire": any((f) => [
    ...raidSeats(f)
      .filter((p) => p.quest.hostId !== f.personId)
      .map((p) => act("quest_party", p)),
    // A cancelled session is no fire (glossary, Held fire), as every other Training badge here reads it.
    ...f.training.attended.filter((a) => !a.selfLogged && !a.cancelled && a.organiserId !== f.personId).map((a) => act("training_attendance", a)),
  ]),
  "ill-try-that": any((f) => marks(f, "trying", true)),
  "summoners-circle": any((f) => givenLive(f).map((q) => act("quests", q))),
  "free-sword": any((f) =>
    f.quests.party
      .filter((p) => seated(p) && p.acceptedAt !== null && p.quest.kind === "bounty" && !p.quest.required && p.quest.giverId !== f.personId)
      .map((p) => act("quest_party", p)),
  ),
  "kind-word": any(reactionsGiven),
  lighthouse: any(beacons),
  "carried-the-flame": any((f) => beaconRows(f).filter((p) => p.quest.giverId !== f.personId).map((p) => act("quest_party", p))),
  "cold-fire-warm-hands": any((f) => f.hostedRaids.filter((r) => r.held && r.quest.giverId !== f.personId).map((r) => act("quests", r.quest))),
  "the-call-answered": any((f) =>
    f.quests.given
      .filter((q) => q.kind === "raid" && q.hostId !== null && q.hostId !== f.personId)
      .map((q) => act("quests", q)),
  ),
  "hydra-summoner": any((f) =>
    givenLive(f)
      .filter((q) => q.kind === "bounty" && q.headIds.length >= 2)
      .map((q) => act("quests", q)),
  ),
  "lore-request": any((f) =>
    givenLive(f)
      .filter((q) => q.learning)
      .map((q) => act("quests", q)),
  ),
  "dragons-scale": any((f) =>
    hitRows(f)
      .filter((p) => p.quest.monster === "dragon")
      .map((p) => act("quest_party", p)),
  ),
  // The first hit on each of the four monsters; the fourth monster's hit finds it.
  bestiary: atLeast(4, (f) =>
    firstPer(
      hitRows(f),
      (p) => p.quest.monster,
      (p) => act("quest_party", p),
    ),
  ),
  "three-paths": each(
    firstOf(hits),
    firstOf((f) => raidSeats(f).map((p) => act("quest_party", p))),
    firstOf(beacons),
  ),
  footnotes: any((f) =>
    sparkRows(f)
      .filter((s) => s.kind === "learning" && s.sources >= 1)
      .map((s) => act("ideas", s)),
  ),
  unstuck: any((f) => marks(f, "unstuck", false)),
  "built-upon": any((f) =>
    f.sparks.buildNotes
      .filter((n) => n.sparkBy !== f.personId)
      .map((n) => act("idea_builds", n)),
  ),
  homework: any((f) => f.training.submissions.map((s) => act("training_submissions", s))),
  embers: any((f) => f.training.reviews.map((r) => act("training_reviews", r))),
  "campfire-tale": any((f) => f.training.recaps.map((t) => act("trainings", t))),
  "wandering-scholar": any((f) => f.training.selfLogged.map((t) => act("trainings", t))),
  "both-sides-of-the-board": each(
    firstOf((f) =>
      givenLive(f)
        .filter((q) => q.kind === "bounty")
        .map((q) => act("quests", q)),
    ),
    firstOf((f) =>
      hitRows(f)
        .filter((p) => p.quest.giverId !== f.personId)
        .map((p) => act("quest_party", p)),
    ),
  ),

  // Builder families.
  "anvil-i": atLeast(10, leaves),
  "anvil-ii": atLeast(50, leaves),
  "anvil-iii": atLeast(200, leaves),
  "anvil-iv": atLeast(500, leaves),
  "heavy-lift-i": any((f) => shipped(f, (c) => (c.humanTokens ?? 0) >= 2)),
  "heavy-lift-ii": any((f) => shipped(f, (c) => (c.humanTokens ?? 0) >= 5)),
  "heavy-lift-iii": any((f) => shipped(f, (c) => (c.humanTokens ?? 0) >= 10)),
  "sealed-scroll-i": atLeast(1, (f) => shipped(f, (c) => c.prLinked)),
  "sealed-scroll-ii": atLeast(10, (f) => shipped(f, (c) => c.prLinked)),
  "sealed-scroll-iii": atLeast(50, (f) => shipped(f, (c) => c.prLinked)),
  "blueprint-i": atLeast(1, (f) => shipped(f, wholeParent(3))),
  "blueprint-ii": atLeast(5, (f) => shipped(f, wholeParent(3))),
  "blueprint-iii": atLeast(20, (f) => shipped(f, wholeParent(3))),
  "keystone-i": atLeast(1, (f) => shippedPer(f, (c) => c.epicId, (c) => c.epicHasOpenCards === false)),
  "keystone-ii": atLeast(3, (f) => shippedPer(f, (c) => c.epicId, (c) => c.epicHasOpenCards === false)),
  "keystone-iii": atLeast(10, (f) => shippedPer(f, (c) => c.epicId, (c) => c.epicHasOpenCards === false)),
  "cartographer-i": atLeast(3, (f) => shippedPer(f, (c) => c.epicId)),
  "cartographer-ii": atLeast(10, (f) => shippedPer(f, (c) => c.epicId)),
  "cartographer-iii": atLeast(25, (f) => shippedPer(f, (c) => c.epicId)),
  "starforged-i": atLeast(1, (f) => shipped(f, (c) => c.ideaId !== null)),
  "starforged-ii": atLeast(3, (f) => shipped(f, (c) => c.ideaId !== null)),
  "starforged-iii": atLeast(10, (f) => shipped(f, (c) => c.ideaId !== null)),

  // Builder one-offs.
  "first-strike": any((f) => shipped(f)),
  weighed: any((f) => shipped(f, (c) => c.humanTokens !== null)),
  "under-the-banner": any((f) => shipped(f, (c) => c.sprintHasGoal)),
  "word-kept": any((f) => shipped(f, (c) => c.subjectType === "meeting_action_item")),
  "guild-contract": any((f) => shipped(f, (c) => c.subjectType === "client_backlog_item")),
  "town-crier": any((f) => shipped(f, (c) => c.subjectType !== null && MARKETING.has(c.subjectType))),
  "path-clearer": any((f) => shipped(f, (c) => c.unblocks)),
  artefact: any((f) => shipped(f, (c) => c.deliverable)),
  "shared-anvil": any((f) => shipped(f, (c) => c.parentId !== null && c.siblingShippedBy.some((id) => id !== f.personId))),
  guildhalls: atLeast(3, (f) => shippedPer(f, (c) => c.boardId)),
  "deep-foundations": any((f) => shipped(f, (c) => c.prLinked && NAMES_A_MIGRATION.test(c.title))),

  // Crossover.
  "both-hands": {
    find: (f) => {
      if (!(f.ladders.learnSharePoints > 0 && f.ladders.builderPoints > 0)) return null;
      // Found by the later of the first act on each ladder; the points say it is found even when the facts cannot name the act.
      const witness = all(nth([...hits(f), ...sparks(f), ...fires(f), ...beacons(f)], 1), nth(leaves(f), 1));
      return witness ? found(witness) : { witness: null };
    },
  },
  "twin-crowns-i": { find: (f) => crowns(f, "gold", "archon") },
  "twin-crowns-ii": { find: (f) => crowns(f, "diamond", "ancient") },
  "twin-crowns-iii": { find: (f) => crowns(f, "master", "divine") },
  "dream-forged": any((f) => {
    const mine = new Set(sparkRows(f).map((s) => s.id));
    return shipped(f, (c) => c.ideaId !== null && mine.has(c.ideaId));
  }),
  "two-trades": each(
    (f) => nth(hits(f), 10),
    (f) => nth(leaves(f), 10),
  ),
  "every-road": each(firstOf(hits), firstOf(sparks), firstOf(fires), firstOf(beacons), firstOf((f) => shipped(f, (c) => (c.humanTokens ?? 0) >= 2))),

  // Secret.
  duel: any((f) =>
    hitRows(f)
      .filter((p) => p.quest.giverId !== f.personId && p.quest.partySize === 1)
      .map((p) => act("quest_party", p)),
  ),
  "all-heads-bow": any((f) => hydrasTamed(f, 5)),
  "swapped-seats": any((f) => {
    // Someone came to a fire of mine, and I sat at a taught, held session of a Raid they host.
    const cameToMine = new Set(fireRows(f).flatMap((r) => r.attended.filter((id) => id !== f.personId)));
    return f.training.attended
      .filter((a) => !a.selfLogged && !a.cancelled)
      .filter((a) => {
        const host = f.raidHosts.get(a.trainingId);
        return host !== undefined && host !== f.personId && cameToMine.has(host);
      })
      .map((a) => act("training_attendance", a));
  }),
  "kind-for-kind": {
    find: (f) => {
      const pairs: Act[] = [];
      for (const given of f.quests.reactionsGiven) {
        if (given.turnInBy === f.personId) continue;
        const back = nth(
          f.quests.reactionsReceived.filter((r) => r.giverId === given.turnInBy).map((r) => act("quest_reactions", r)),
          1,
        );
        const pair = all(act("quest_reactions", given), back);
        if (pair) pairs.push(pair);
      }
      return found(nth(pairs, 1));
    },
  },
  "proven-in-the-field": any((f) => f.sparks.heldReceived.filter((h) => h.by !== f.personId).map((h) => act("idea_reactions", h))),
  "spark-to-flame": any((f) => f.sparkCards.filter((c) => c.assigneeId !== null && c.assigneeId !== f.personId).map((c) => act("tasks", c))),
  feather: any((f) => shipped(f, (c) => c.humanTokens !== null && Math.round(c.humanTokens * 100) === 5)),
  phoenix: any((f) => shipped(f, (c) => c.backFromDone)),
  cathedral: any((f) => shipped(f, wholeParent(10))),
  "well-read": any((f) =>
    sparkRows(f)
      .filter((s) => s.kind === "learning" && s.sources >= 3)
      .map((s) => act("ideas", s)),
  ),
};

/** Twin crowns: the tiers the person holds on both ladders, at once; the tiers are the proof, so no row is named. */
function crowns(f: PersonActFacts, learnShare: "gold" | "diamond" | "master", builder: "archon" | "ancient" | "divine"): Found | null {
  const held = tierIndex("learn_share", f.ladders.learnShare) >= tierIndex("learn_share", learnShare) && tierIndex("builder", f.ladders.builder) >= tierIndex("builder", builder);
  return held ? { witness: null } : null;
}

const NUMERAL = / (I|II|III|IV)$/;

function define(entry: BadgeEntry): Badge {
  const rule = RULES[entry.id];
  if (!rule) throw new Error(`[ladders/badges] no rule for ${entry.id}`);
  return { ...entry, secret: entry.group === "secret", title: entry.family ?? entry.name.replace(NUMERAL, ""), ...rule };
}

/** Every ready badge of the catalogue, in its order. */
export const BADGES: readonly Badge[] = CATALOGUE.map(define);

/** A badge by id, or undefined for an id the catalogue does not hold. */
export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}

/** Every badge the facts find, each with its witness, in catalogue order. */
export function findBadges(facts: PersonActFacts): { badge: Badge; found: Found }[] {
  const out: { badge: Badge; found: Found }[] = [];
  for (const badge of BADGES) {
    const f = badge.find(facts);
    if (f) out.push({ badge, found: f });
  }
  return out;
}
