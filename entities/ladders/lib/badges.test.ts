import { describe, expect, it } from "vitest";
import type { PersonActFacts } from "./act-facts";
import type { WitnessTable } from "./badge-acts";
import { BADGES, badgeById, findBadges } from "./badges";
import {
  MATE,
  ME,
  attended,
  beacon,
  buildNote,
  card,
  facts,
  given,
  heldBy,
  hit,
  hosted,
  hydra,
  made,
  mark,
  party,
  quest,
  reaction,
  seat,
  spark,
  sparkCard,
  tamed,
  times,
} from "./badge-fixtures";

// The predicate table test (LD.7; spec "Testing Decisions"; the catalogue,
// docs/engineering/2026-10-21-ladders-badges.md): one row per badge of the
// catalogue, the acts that find it and the table its witness names; for every
// tier with a threshold, the same acts one short find nothing. Then the five
// rules as negative rows: a Missed, a hand-back, a skip, a card set aside and
// a clock find nothing, and a secret badge is found by its act and never by
// time.

type Row = {
  /** Acts that find the badge. */
  finds: PersonActFacts;
  /** The table the witness names; null when the badge's proof is a tier. */
  witness: WitnessTable | null;
  /** Acts one short of it, which find nothing of it. */
  short?: PersonActFacts;
};

/** A tier found at a count: the count of acts finds it, one fewer does not. */
const tier = (n: number, witness: WitnessTable, make: (k: number) => PersonActFacts): Row => ({ finds: make(n), short: make(n - 1), witness });

const hits = (k: number) => facts({ party: times(k, () => hit()) });
const learning = (k: number) => facts({ sparks: times(k, () => spark()) });
const builds = (k: number) => facts({ sparks: times(k, () => spark({ kind: "build" })) });
const gave = (k: number) => facts({ given: times(k, () => given()) });
const reacted = (k: number) => facts({ reactionsGiven: times(k, () => reaction()) });
const fires = (k: number) => facts({ hostedRaids: times(k, () => hosted()) });
const beacons = (k: number) => facts({ party: times(k, () => beacon()) });
const hydras = (k: number) => facts({ party: times(k, () => tamed(hydra(2))).flat() });
const learningHits = (k: number) => facts({ party: times(k, () => hit({ learning: true })) });
const helds = (k: number) => facts({ marksGiven: times(k, () => mark("held")) });
const leaves = (k: number) => facts({ cards: times(k, () => card()) });
const shippedWith = (k: number, over: Parameters<typeof card>[0]) => facts({ cards: times(k, () => card(over)) });
const parents = (k: number, children: number) => facts({ cards: times(k, () => card({ liveChildren: children, openChildren: 0 })) });
const epics = (k: number, closed: boolean) => facts({ cards: times(k, (i) => card({ epicId: `epic-${i}`, epicHasOpenCards: !closed })) });

const ROWS: Record<string, Row> = {
  // Learn & Share families.
  "hunter-i": tier(3, "quest_party", hits),
  "hunter-ii": tier(10, "quest_party", hits),
  "hunter-iii": tier(30, "quest_party", hits),
  "hunter-iv": tier(100, "quest_party", hits),
  "lorewright-i": tier(3, "ideas", learning),
  "lorewright-ii": tier(10, "ideas", learning),
  "lorewright-iii": tier(30, "ideas", learning),
  "lorewright-iv": tier(100, "ideas", learning),
  "stargazer-i": tier(3, "ideas", builds),
  "stargazer-ii": tier(10, "ideas", builds),
  "stargazer-iii": tier(30, "ideas", builds),
  "summoner-i": tier(3, "quests", gave),
  "summoner-ii": tier(10, "quests", gave),
  "summoner-iii": tier(30, "quests", gave),
  "tavern-keeper-i": tier(3, "quest_reactions", reacted),
  "tavern-keeper-ii": tier(10, "quest_reactions", reacted),
  "tavern-keeper-iii": tier(30, "quest_reactions", reacted),
  "fire-keeper-i": tier(1, "quests", fires),
  "fire-keeper-ii": tier(5, "quests", fires),
  "fire-keeper-iii": tier(20, "quests", fires),
  "fire-keeper-iv": tier(50, "quests", fires),
  "keeper-of-the-light-i": tier(3, "quest_party", beacons),
  "keeper-of-the-light-ii": tier(10, "quest_party", beacons),
  "keeper-of-the-light-iii": tier(25, "quest_party", beacons),
  "hydra-tamer-i": tier(1, "quest_party", hydras),
  "hydra-tamer-ii": tier(3, "quest_party", hydras),
  "hydra-tamer-iii": tier(10, "quest_party", hydras),
  "scribe-i": tier(1, "quest_party", learningHits),
  "scribe-ii": tier(5, "quest_party", learningHits),
  "scribe-iii": tier(20, "quest_party", learningHits),
  "tried-and-true-i": tier(1, "idea_reactions", helds),
  "tried-and-true-ii": tier(5, "idea_reactions", helds),
  "tried-and-true-iii": tier(20, "idea_reactions", helds),

  // Learn & Share one-offs.
  "first-hit": tier(1, "quest_party", hits),
  "spark-struck": { finds: facts({ sparks: [spark({ kind: "build" })] }), short: facts({ sparks: [spark({ archived: true })] }), witness: "ideas" },
  "first-page": { finds: learning(1), short: builds(1), witness: "ideas" },
  "seat-by-the-fire": { finds: facts({ party: [seat()] }), short: facts({ party: [party(quest({ kind: "raid", hostId: ME }), { standing: "accepted" })] }), witness: "quest_party" },
  "ill-try-that": { finds: facts({ marksGiven: [mark("trying")] }), short: facts({ marksGiven: [mark("trying", { sparkBy: ME })] }), witness: "idea_reactions" },
  "summoners-circle": { finds: gave(1), short: facts({ given: [given({ state: "withdrawn" })] }), witness: "quests" },
  "free-sword": {
    finds: facts({ party: [party(quest({ required: false }), { standing: "accepted" })] }),
    short: facts({ party: [party(quest({ required: true }), { standing: "accepted" })] }),
    witness: "quest_party",
  },
  "kind-word": tier(1, "quest_reactions", reacted),
  lighthouse: { finds: beacons(1), short: facts({ party: [party(quest({ kind: "beacon" }))] }), witness: "quest_party" },
  "carried-the-flame": { finds: facts({ party: [beacon()] }), short: facts({ party: [beacon({ giverId: ME })] }), witness: "quest_party" },
  "cold-fire-warm-hands": { finds: facts({ hostedRaids: [hosted([], {}, { giverId: MATE })] }), short: facts({ hostedRaids: [hosted([], { held: false }, { giverId: MATE })] }), witness: "quests" },
  "the-call-answered": { finds: facts({ given: [given({ kind: "raid", hostId: MATE })] }), short: facts({ given: [given({ kind: "raid", hostId: null })] }), witness: "quests" },
  "hydra-summoner": { finds: facts({ given: [hydra(2, { giverId: ME })] }), short: facts({ given: [given()] }), witness: "quests" },
  "lore-request": { finds: facts({ given: [given({ learning: true })] }), short: facts({ given: [given({ learning: true, state: "withdrawn" })] }), witness: "quests" },
  "dragons-scale": { finds: facts({ party: [hit({ monster: "dragon", partySize: 15 })] }), short: facts({ party: [hit({ monster: "big_slime", partySize: 14 })] }), witness: "quest_party" },
  bestiary: {
    finds: facts({ party: [hit({ monster: "slime" }), hit({ monster: "big_slime" }), hit({ monster: "dragon" }), ...tamed(hydra(2))] }),
    short: facts({ party: [hit({ monster: "slime" }), hit({ monster: "big_slime" }), hit({ monster: "dragon" }), hit({ monster: "dragon" })] }),
    witness: "quest_party",
  },
  "three-paths": { finds: facts({ party: [hit(), seat(), beacon()] }), short: facts({ party: [hit(), seat()] }), witness: "quest_party" },
  footnotes: { finds: facts({ sparks: [spark({ sources: 1 })] }), short: facts({ sparks: [spark({ kind: "build", sources: 2 })] }), witness: "ideas" },
  unstuck: { finds: facts({ marksGiven: [mark("unstuck", { sparkKind: "build" })] }), short: facts({ marksGiven: [mark("unstuck", { sparkBy: ME })] }), witness: "idea_reactions" },
  "built-upon": { finds: facts({ buildNotes: [buildNote()] }), short: facts({ buildNotes: [buildNote({ sparkBy: ME })] }), witness: "idea_builds" },
  homework: { finds: facts({ submissions: [made("submission")] }), witness: "training_submissions" },
  embers: { finds: facts({ reviews: [made("review")] }), witness: "training_reviews" },
  "campfire-tale": { finds: facts({ recaps: [made("training")] }), witness: "trainings" },
  "wandering-scholar": { finds: facts({ selfLogged: [made("training")] }), witness: "trainings" },
  "both-sides-of-the-board": { finds: facts({ given: [given()], party: [hit()] }), short: facts({ given: [given()], party: [hit({ giverId: ME })] }), witness: "quest_party" },

  // Builder families.
  "anvil-i": tier(10, "tasks", leaves),
  "anvil-ii": tier(50, "tasks", leaves),
  "anvil-iii": tier(200, "tasks", leaves),
  "anvil-iv": tier(500, "tasks", leaves),
  "heavy-lift-i": { finds: shippedWith(1, { humanTokens: 2 }), short: shippedWith(1, { humanTokens: 1.95 }), witness: "tasks" },
  "heavy-lift-ii": { finds: shippedWith(1, { humanTokens: 5, liveChildren: 4 }), short: shippedWith(1, { humanTokens: 4.95 }), witness: "tasks" },
  "heavy-lift-iii": { finds: shippedWith(1, { humanTokens: 10 }), short: shippedWith(1, { humanTokens: 9.95 }), witness: "tasks" },
  "sealed-scroll-i": tier(1, "tasks", (k) => shippedWith(k, { prLinked: true })),
  "sealed-scroll-ii": tier(10, "tasks", (k) => shippedWith(k, { prLinked: true })),
  "sealed-scroll-iii": tier(50, "tasks", (k) => shippedWith(k, { prLinked: true })),
  "blueprint-i": tier(1, "tasks", (k) => parents(k, 3)),
  "blueprint-ii": tier(5, "tasks", (k) => parents(k, 3)),
  "blueprint-iii": tier(20, "tasks", (k) => parents(k, 3)),
  "keystone-i": tier(1, "tasks", (k) => epics(k, true)),
  "keystone-ii": tier(3, "tasks", (k) => epics(k, true)),
  "keystone-iii": tier(10, "tasks", (k) => epics(k, true)),
  "cartographer-i": tier(3, "tasks", (k) => epics(k, false)),
  "cartographer-ii": tier(10, "tasks", (k) => epics(k, false)),
  "cartographer-iii": tier(25, "tasks", (k) => epics(k, false)),
  "starforged-i": tier(1, "tasks", (k) => facts({ cards: times(k, (i) => card({ ideaId: `idea-of-mate-${i}` })) })),
  "starforged-ii": tier(3, "tasks", (k) => facts({ cards: times(k, (i) => card({ ideaId: `idea-of-mate-${i}` })) })),
  "starforged-iii": tier(10, "tasks", (k) => facts({ cards: times(k, (i) => card({ ideaId: `idea-of-mate-${i}` })) })),

  // Builder one-offs.
  "first-strike": { finds: leaves(1), short: shippedWith(1, { status: "open", completedAt: null }), witness: "tasks" },
  weighed: { finds: shippedWith(1, { humanTokens: 0.5 }), short: shippedWith(1, { humanTokens: null }), witness: "tasks" },
  "under-the-banner": { finds: shippedWith(1, { sprintId: "sprint-1", sprintHasGoal: true }), short: shippedWith(1, { sprintId: "sprint-1" }), witness: "tasks" },
  "word-kept": { finds: shippedWith(1, { subjectType: "meeting_action_item" }), short: shippedWith(1, { subjectType: "client_backlog_item" }), witness: "tasks" },
  "guild-contract": { finds: shippedWith(1, { subjectType: "client_backlog_item" }), short: shippedWith(1, { subjectType: "meeting_action_item" }), witness: "tasks" },
  "town-crier": { finds: shippedWith(1, { subjectType: "marketing_day" }), short: shippedWith(1, { subjectType: "meeting_action_item" }), witness: "tasks" },
  "path-clearer": { finds: shippedWith(1, { unblocks: true }), short: leaves(1), witness: "tasks" },
  artefact: { finds: shippedWith(1, { deliverable: true }), short: leaves(1), witness: "tasks" },
  "shared-anvil": { finds: shippedWith(1, { parentId: "parent-1", siblingShippedBy: [MATE] }), short: shippedWith(1, { parentId: "parent-1" }), witness: "tasks" },
  guildhalls: tier(3, "tasks", (k) => facts({ cards: times(k, (i) => card({ boardId: `board-${i}` })) })),
  "deep-foundations": {
    finds: shippedWith(1, { prLinked: true, title: "Add the migration for ladder unlocks" }),
    short: shippedWith(1, { prLinked: true, title: "Migrate the drawer copy" }),
    witness: "tasks",
  },

  // Crossover.
  "both-hands": { finds: facts({ party: [hit()], cards: [card()], ladders: { learnSharePoints: 10, builderPoints: 10 } }), short: facts({ party: [hit()], ladders: { learnSharePoints: 10 } }), witness: "tasks" },
  "twin-crowns-i": { finds: facts({ ladders: { learnShare: "gold", builder: "archon" } }), short: facts({ ladders: { learnShare: "silver", builder: "immortal" } }), witness: null },
  "twin-crowns-ii": { finds: facts({ ladders: { learnShare: "sovereign", builder: "ancient" } }), short: facts({ ladders: { learnShare: "diamond", builder: "legend" } }), witness: null },
  "twin-crowns-iii": { finds: facts({ ladders: { learnShare: "master", builder: "divine" } }), short: facts({ ladders: { learnShare: "diamond", builder: "immortal" } }), witness: null },
  "dream-forged": (() => {
    const mine = spark({ kind: "build" });
    return { finds: facts({ sparks: [mine], cards: [card({ ideaId: mine.id })] }), short: facts({ sparks: [mine], cards: [card({ ideaId: "idea-of-mate" })] }), witness: "tasks" as const };
  })(),
  "two-trades": { finds: facts({ party: times(10, () => hit()), cards: times(10, () => card()) }), short: facts({ party: times(10, () => hit()), cards: times(9, () => card()) }), witness: "tasks" },
  "every-road": {
    finds: facts({ party: [hit(), beacon()], sparks: [spark()], hostedRaids: [hosted()], cards: [card({ humanTokens: 2 })] }),
    short: facts({ party: [hit(), beacon()], sparks: [spark()], hostedRaids: [hosted([ME])], cards: [card({ humanTokens: 2 })] }),
    witness: "tasks",
  },

  // Secret.
  duel: { finds: facts({ party: [hit({ partySize: 1 })] }), short: facts({ party: [hit({ partySize: 1, giverId: ME })] }), witness: "quest_party" },
  "all-heads-bow": { finds: facts({ party: tamed(hydra(5)) }), short: facts({ party: tamed(hydra(4)) }), witness: "quest_party" },
  "swapped-seats": (() => {
    const theirs = attended();
    return {
      finds: facts({ hostedRaids: [hosted([MATE])], attended: [theirs], raidHosts: { [theirs.trainingId]: MATE } }),
      short: facts({ hostedRaids: [hosted(["someone-else"])], attended: [theirs], raidHosts: { [theirs.trainingId]: MATE } }),
      witness: "training_attendance" as const,
    };
  })(),
  "kind-for-kind": {
    finds: facts({ reactionsGiven: [reaction({ turnInBy: MATE })], reactionsReceived: [reaction({ giverId: MATE, turnInBy: ME })] }),
    short: facts({ reactionsGiven: [reaction({ turnInBy: MATE })], reactionsReceived: [reaction({ giverId: "someone-else", turnInBy: ME })] }),
    witness: "quest_reactions",
  },
  "proven-in-the-field": { finds: facts({ heldReceived: [heldBy(MATE)] }), short: facts({ heldReceived: [heldBy(ME)] }), witness: "idea_reactions" },
  "spark-to-flame": (() => {
    const mine = spark({ kind: "build" });
    return { finds: facts({ sparks: [mine], sparkCards: [sparkCard(mine.id, MATE)] }), short: facts({ sparks: [mine], sparkCards: [sparkCard(mine.id, ME)] }), witness: "tasks" as const };
  })(),
  feather: { finds: shippedWith(1, { humanTokens: 0.05 }), short: shippedWith(1, { humanTokens: 0.1 }), witness: "tasks" },
  phoenix: { finds: shippedWith(1, { backFromDone: true }), short: leaves(1), witness: "tasks" },
  cathedral: { finds: parents(1, 10), short: facts({ cards: [card({ liveChildren: 10, openChildren: 1 })] }), witness: "tasks" },
  "well-read": { finds: facts({ sparks: [spark({ sources: 3 })] }), short: facts({ sparks: [spark({ sources: 2 })] }), witness: "ideas" },
};

describe("the badge catalogue as data", () => {
  it("holds the 108 ready badges, ids unique and spelled as the catalogue spells them", () => {
    expect(BADGES).toHaveLength(108);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(108);
    for (const b of BADGES) expect(b.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("splits as the catalogue's summary does", () => {
    const by = (key: (b: (typeof BADGES)[number]) => string) => BADGES.reduce<Record<string, number>>((n, b) => ({ ...n, [key(b)]: (n[key(b)] ?? 0) + 1 }), {});
    expect(by((b) => b.ladder)).toEqual({ learn_share: 64, builder: 36, both: 8 });
    expect(by((b) => b.rarity)).toEqual({ common: 26, uncommon: 34, rare: 27, epic: 15, legendary: 6 });
    expect(by((b) => b.group)).toEqual({ family: 55, "one-off": 36, crossover: 7, secret: 10 });
  });

  it("gives every secret badge a hint and no other badge one, and offers each badge's name without its numeral as its Title", () => {
    for (const b of BADGES) expect(b.hint, b.id).toEqual(b.secret ? expect.stringMatching(/^\?\?\? /) : null);
    expect(badgeById("fire-keeper-iii")?.title).toBe("Fire keeper");
    expect(badgeById("twin-crowns-ii")?.title).toBe("Twin crowns");
    expect(badgeById("hydra-summoner")?.title).toBe("Hydra summoner");
  });

  it("has a table row for every badge and for nothing else", () => {
    expect(Object.keys(ROWS).sort()).toEqual(BADGES.map((b) => b.id).sort());
  });
});

describe("the predicate table: each badge is found by its acts, with its witness", () => {
  it.each(BADGES.map((b) => [b.id, b] as const))("%s", (id, badge) => {
    const row = ROWS[id];
    const found = badge.find(row.finds);
    expect(found, `${id} is found`).not.toBeNull();
    expect(found?.witness?.table ?? null).toBe(row.witness);
    if (row.short) expect(badge.find(row.short), `${id} one short`).toBeNull();
  });

  it("names the act that brought the count to the threshold as the witness", () => {
    const three = times(4, () => hit());
    const found = badgeById("hunter-i")?.find(facts({ party: three }));
    expect(found?.witness).toEqual({ table: "quest_party", id: three[2].id });
  });

  it("names the head turned in last as a tamed Hydra's witness", () => {
    const rows = tamed(hydra(3));
    expect(badgeById("hydra-tamer-i")?.find(facts({ party: [...rows].reverse() }))?.witness).toEqual({ table: "quest_party", id: rows[2].id });
  });

  it("counts a family tier for the owner's locked tile", () => {
    const hunter = badgeById("hunter-ii");
    expect(hunter?.count?.at).toBe(10);
    expect(hunter?.count?.of(hits(7))).toBe(7);
  });

  it("finds nothing at all for a person who has done nothing", () => {
    expect(findBadges(facts())).toEqual([]);
  });
});

/** Every `at` in the facts moved by the years given; nothing else changes. */
function moved(f: PersonActFacts, years: number): PersonActFacts {
  const shift = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(shift);
    if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, shift(x)]));
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => {
          if (k === "at" && typeof x === "string") {
            const d = new Date(x);
            d.setUTCFullYear(d.getUTCFullYear() + years);
            return [k, d.toISOString()];
          }
          return [k, shift(x)];
        }),
      );
    }
    return v;
  };
  return shift(f) as PersonActFacts;
}

describe("the five rules, as negative rows", () => {
  it("a Missed finds nothing, even a row that was accepted first", () => {
    const missed = (kind: "bounty" | "raid" | "beacon") => party(quest({ kind, required: false }), { standing: "missed" as never, turnInUrl: "https://example.com/x" });
    expect(findBadges(facts({ party: [missed("bounty"), missed("raid"), missed("beacon")] }))).toEqual([]);
  });

  it("a hand-back finds nothing", () => {
    const back = (kind: "bounty" | "raid" | "beacon") => party(quest({ kind, required: false }), { standing: "handed_back" as never });
    expect(findBadges(facts({ party: [back("bounty"), back("raid"), back("beacon")] }))).toEqual([]);
  });

  it("a skip finds nothing, and nor does an admire or a me-too", () => {
    const marks = (["skip", "admire", "me_too"] as const).map((kind) => mark(kind as never));
    expect(findBadges(facts({ marksGiven: marks }))).toEqual([]);
  });

  it("a card set aside finds nothing", () => {
    expect(findBadges(facts({ cards: [card({ status: "not_doing", humanTokens: 10, prLinked: true, liveChildren: 10 })] }))).toEqual([]);
  });

  it("an accepted Bounty is no hit, and a Turn-in with no link lights no Beacon", () => {
    const found = findBadges(facts({ party: [party(quest(), { standing: "accepted" }), party(quest({ kind: "beacon" }))] })).map((f) => f.badge.id);
    expect(found).toEqual(["free-sword"]);
  });

  it("a clock alone unlocks nothing: the same acts years later find exactly the same badges", () => {
    const lived = facts({
      party: [...times(2, () => hit()), seat(), beacon()],
      sparks: [spark(), spark({ kind: "build", sources: 3 })],
      cards: times(9, () => card({ prLinked: true })),
      hostedRaids: [hosted([ME])],
      ladders: { learnSharePoints: 290, builderPoints: 90 },
    });
    const now = findBadges(lived).map((f) => f.badge.id);
    expect(findBadges(moved(lived, 5)).map((f) => f.badge.id)).toEqual(now);
    expect(findBadges(moved(lived, -5)).map((f) => f.badge.id)).toEqual(now);
    // Nine cards and two hits stay below Anvil I and Hunter I however long they sit.
    expect(now).not.toContain("anvil-i");
    expect(now).not.toContain("hunter-i");
  });

  it("a secret badge is found by its act and never by time", () => {
    for (const badge of BADGES.filter((b) => b.secret)) {
      const row = ROWS[badge.id];
      expect(badge.find(facts()), badge.id).toBeNull();
      expect(badge.find(moved(facts(), 10)), badge.id).toBeNull();
      if (row.short) expect(badge.find(moved(row.short, 10)), `${badge.id} short, later`).toBeNull();
      expect(badge.find(moved(row.finds, 10)), `${badge.id} later`).not.toBeNull();
    }
  });

  it("a Raid that only its Host came to lights no fire", () => {
    expect(badgeById("fire-keeper-i")?.find(facts({ hostedRaids: [hosted([ME]), hosted([], { held: false }), hosted([MATE], { selfLogged: true })] }))).toBeNull();
  });

  it("a taught session someone else organised is a seat by the fire; a self-logged one or one I organised is not", () => {
    const seatBy = badgeById("seat-by-the-fire");
    expect(seatBy?.find(facts({ attended: [attended()] }))?.witness?.table).toBe("training_attendance");
    expect(seatBy?.find(facts({ attended: [attended({ selfLogged: true }), attended({ organiserId: ME })] }))).toBeNull();
  });

  it("a cancelled session is no seat by the fire, as it is no fire for any other badge", () => {
    expect(badgeById("seat-by-the-fire")?.find(facts({ attended: [attended({ cancelled: true })] }))).toBeNull();
  });

  it("an archived spark counts for nothing, whatever it cites: the catalogue's SPARKS is shared with the points", () => {
    const archived = spark({ kind: "learning", archived: true, sources: 3 });
    expect(findBadges(facts({ sparks: [archived] }))).toEqual([]);
    expect(badgeById("dream-forged")?.find(facts({ sparks: [archived], cards: [card({ ideaId: archived.id })] }))).toBeNull();
  });
});
