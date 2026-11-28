// Act facts in the glossary's words, for the badge tests (LD.7): a Turn-in, a
// spark, a card shipped, a session attended, each built with the fields the
// owners' doors hand over, so a test reads as the acts a person did. Every
// fact made here is later than the one made before it, so the order of the
// witnesses is the order a test writes the acts in. Imported by test files only.
import type { ShippedCardFact, SparkCardFact } from "@/entities/boards";
import type { BuildNoteFact, HeldFact, MarkFact, SparkFact, SparkFacts } from "@/entities/ideas";
import type { HostedRaid, PartyFact, QuestFact, QuestFacts, ReactionFact } from "@/entities/quests";
import type { AttendedFact, MadeFact, TrainingFacts } from "@/entities/training";
import { noFacts, type LadderFacts, type PersonActFacts } from "./act-facts";

export const ME = "person-me";
export const MATE = "person-mate";

let seq = 0;
const next = (prefix: string): string => `${prefix}-${++seq}`;
/** A time after every time made before it. */
const later = (): string => new Date(Date.UTC(2026, 0, 1) + ++seq * 60_000).toISOString();

export function quest(over: Partial<QuestFact> = {}): QuestFact {
  return { id: next("quest"), kind: "bounty", state: "open", giverId: MATE, hostId: null, learning: false, required: false, trainingId: null, headIds: [next("head")], partySize: 3, monster: "slime", at: later(), ...over };
}

/** A Hydra of n heads, given by a teammate. */
export const hydra = (heads: number, over: Partial<QuestFact> = {}): QuestFact => quest({ headIds: Array.from({ length: heads }, () => next("head")), monster: "hydra", ...over });

export function party(q: QuestFact, over: Partial<PartyFact> = {}): PartyFact {
  return { id: next("party"), headId: q.headIds[0], standing: "turned_in", acceptedAt: later(), turnInUrl: null, at: later(), quest: q, ...over };
}

/** A Turn-in on a head of a Bounty: a hit. */
export const hit = (q: Partial<QuestFact> = {}, p: Partial<PartyFact> = {}): PartyFact => party(quest(q), p);

/** A Turn-in on every head of a Hydra. */
export const tamed = (q: QuestFact): PartyFact[] => q.headIds.map((headId) => party(q, { headId }));

/** A Beacon lit: a Turn-in on a Beacon with its link. */
export const beacon = (q: Partial<QuestFact> = {}): PartyFact => party(quest({ kind: "beacon", ...q }), { turnInUrl: "https://example.com/talk" });

/** A seat at a Raid a teammate hosts. */
export const seat = (over: Partial<PartyFact> = {}): PartyFact => party(quest({ kind: "raid", hostId: MATE }), { standing: "accepted", ...over });

/** A quest the person gave. */
export const given = (over: Partial<QuestFact> = {}): QuestFact => quest({ giverId: ME, ...over });

/**
 * A Raid the person hosts, its session ended and attended by the people named,
 * as Quests judges it: held when someone other than the person came.
 */
export function hosted(attended: string[] = [MATE], over: Partial<HostedRaid> = {}, q: Partial<QuestFact> = {}): HostedRaid {
  return { quest: quest({ kind: "raid", giverId: ME, hostId: ME, trainingId: next("training"), ...q }), lit: true, held: attended.some((id) => id !== ME), attended, ...over };
}

/** A person's Quests facts: whatever is given, and nothing else. */
export const onQuests = (over: Partial<QuestFacts> = {}): QuestFacts => ({ party: [], given: [], hosted: [], reactionsGiven: [], reactionsReceived: [], ...over });

export const reaction = (over: Partial<ReactionFact> = {}): ReactionFact => ({ id: next("reaction"), questId: next("quest"), giverId: ME, turnInBy: MATE, at: later(), ...over });

export const spark = (over: Partial<SparkFact> = {}): SparkFact => ({ id: next("idea"), kind: "learning", archived: false, sources: 0, at: later(), ...over });

/** A person's Spark facts: whatever is given, and nothing else. */
export const onSparks = (over: Partial<SparkFacts> = {}): SparkFacts => ({ sparks: [], marksGiven: [], buildNotes: [], heldReceived: [], ...over });

export const mark = (kind: MarkFact["kind"], over: Partial<MarkFact> = {}): MarkFact => ({ id: next("mark"), ideaId: next("idea"), kind, sparkKind: "learning", sparkBy: MATE, at: later(), ...over });

export const buildNote = (over: Partial<BuildNoteFact> = {}): BuildNoteFact => ({ id: next("note"), ideaId: next("idea"), sparkBy: MATE, at: later(), ...over });

export const heldBy = (by: string, over: Partial<HeldFact> = {}): HeldFact => ({ id: next("held"), ideaId: next("idea"), by, at: later(), ...over });

/** A leaf card shipped by the person. */
export function card(over: Partial<ShippedCardFact> = {}): ShippedCardFact {
  const at = later();
  return {
    id: next("card"),
    assigneeId: ME,
    humanTokens: 1,
    status: "done",
    completedAt: at,
    archivedAt: null,
    liveChildren: 0,
    openChildren: 0,
    parentId: null,
    boardId: "board-1",
    epicId: null,
    sprintId: null,
    subjectType: null,
    title: "Tidy the drawer",
    prLinked: false,
    ideaId: null,
    unblocks: false,
    deliverable: false,
    sprintHasGoal: false,
    epicHasOpenCards: null,
    backFromDone: false,
    siblingShippedBy: [],
    at,
    ...over,
  };
}

export const sparkCard = (ideaId: string, assigneeId: string | null): SparkCardFact => ({ id: next("card"), ideaId, assigneeId, at: later() });

export const attended = (over: Partial<AttendedFact> = {}): AttendedFact => ({ id: next("attendance"), trainingId: next("training"), organiserId: MATE, selfLogged: false, cancelled: false, at: later(), ...over });

export const made = (prefix: string): MadeFact => ({ id: next(prefix), at: later() });

export const times = <T>(n: number, make: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => make(i));

export type FactsInput = Partial<QuestFacts> &
  Partial<{ sparks: SparkFact[]; marksGiven: MarkFact[]; buildNotes: BuildNoteFact[]; heldReceived: HeldFact[] }> &
  Partial<TrainingFacts> & {
    cards?: ShippedCardFact[];
    sparkCards?: SparkCardFact[];
    raidHosts?: Record<string, string>;
    ladders?: Partial<LadderFacts>;
  };

/** The person's act facts: whatever is given, and nothing else. */
export function facts(input: FactsInput = {}): PersonActFacts {
  const base = noFacts(ME);
  return {
    ...base,
    quests: {
      party: input.party ?? [],
      given: input.given ?? [],
      hosted: input.hosted ?? [],
      reactionsGiven: input.reactionsGiven ?? [],
      reactionsReceived: input.reactionsReceived ?? [],
    },
    sparks: { sparks: input.sparks ?? [], marksGiven: input.marksGiven ?? [], buildNotes: input.buildNotes ?? [], heldReceived: input.heldReceived ?? [] },
    cards: input.cards ?? [],
    sparkCards: input.sparkCards ?? [],
    training: {
      attended: input.attended ?? [],
      submissions: input.submissions ?? [],
      reviews: input.reviews ?? [],
      recaps: input.recaps ?? [],
      selfLogged: input.selfLogged ?? [],
    },
    raidHosts: new Map(Object.entries(input.raidHosts ?? {})),
    ladders: { ...base.ladders, ...input.ladders },
  };
}
