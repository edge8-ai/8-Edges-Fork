// A second question for the ladders (LD.7; ADR 0021; the badge catalogue,
// docs/engineering/2026-10-21-ladders-badges.md): the rest of what a person
// did on Quests, as recorded, for the badges found by doing and, since A.76,
// for the points too, so a hit, a Beacon lit and a fire are each one thing on
// both. Their own party rows that were accepted or turned in, each with its
// quest; the quests they gave; the Raids they host, each judged held or not;
// and the Reactions on the Turn-ins of the quests they touch, so the asker can
// tell a Reaction they gave from one they got.
//
// Held is Quests' answer (ADR 0023): a Raid's session comes from Training's
// door and is judged here, with the one held rule and Quests' own clock, so
// the ladders read the judgment and apply none. Training takes an attended
// mark from the start of a session; a fire is held only once it ends.
// Each row carries its id, which is the witness a badge names, and the time of
// the act, which only orders the witnesses and never decides anything.
//
// What is never asked: a party row that was called and left, handed back or
// missed. The read filters to accepted and turned in, so those rows do not
// reach the ladders at all, and no badge can rest on them (the catalogue's
// rule 4). Every party row of a quest is read for one thing only, the size of
// its Party, because the monster the Quests page draws depends on it
// (monsterFor); the standing of other people's rows is never selected.
//
// Batched by person, chunked to keep each request's URL short, and paged
// because PostgREST answers at most a thousand rows a request.
import { mustPagesIn } from "@/kernel/data/read";
import { isHeld } from "./evolve-model";
import { monsterFor, type Monster } from "./fight";
import { fireSessions } from "./lighthouses-read";
import { selectQuestHeads, selectQuestParty, selectQuestReactions, selectQuests } from "./reads";
import type { QuestKind, QuestState } from "./standing";

export type QuestFact = {
  id: string;
  kind: QuestKind;
  state: QuestState;
  giverId: string;
  hostId: string | null;
  learning: boolean;
  required: boolean;
  trainingId: string | null;
  /** Every head of the quest. */
  headIds: string[];
  /** The people called to it, counted once each, as the Quests page counts them. */
  partySize: number;
  /** The monster the Quests page draws for it. */
  monster: Monster;
  at: string;
};

/** One of the person's own party rows, accepted or turned in, with its quest. */
export type PartyFact = {
  id: string;
  headId: string;
  standing: "accepted" | "turned_in";
  acceptedAt: string | null;
  turnInUrl: string | null;
  at: string;
  quest: QuestFact;
};

/** A Raid the person hosts, judged at Quests' clock. */
export type HostedRaid = {
  quest: QuestFact;
  /** It has a session that was not cancelled: lit, and never put out. False while the campfire is cold. */
  lit: boolean;
  /** A Held fire: its session ended, was not cancelled, and someone other than the Host attended. */
  held: boolean;
  /** The people marked attended, not removed, the Host among them if marked. */
  attended: readonly string[];
};

/** A Reaction the Giver of a quest gave to a Turn-in on it. */
export type ReactionFact = { id: string; questId: string; giverId: string; turnInBy: string; at: string };

export type QuestFacts = {
  party: PartyFact[];
  /** The quests the person gave, withdrawn ones included (the rule decides). */
  given: QuestFact[];
  /** The Raids the person hosts, each judged. */
  hosted: HostedRaid[];
  /** Reactions the person gave, as the Giver, to Turn-ins on their quests. */
  reactionsGiven: ReactionFact[];
  /** Reactions a Giver gave to the person's own Turn-ins. */
  reactionsReceived: ReactionFact[];
};

type QuestRow = { id: string; kind: QuestKind; state: QuestState; giver_id: string; host_id: string | null; learning: boolean; required: boolean; training_id: string | null; created_at: string };
type PartyRow = { id: string; quest_id: string; head_id: string; person_id: string; standing: "accepted" | "turned_in"; accepted_at: string | null; turn_in_url: string | null; turned_in_at: string | null; created_at: string };
type ReactionRow = { id: string; quest_id: string; party_id: string; created_at: string };

const QUEST_COLUMNS = "id, kind, state, giver_id, host_id, learning, required, training_id, created_at";

/** Each person's quest facts, a hosted Raid judged at `now`; a person with none gets empty lists. */
export async function questFactsOf(personIds: readonly string[], now: Date = new Date()): Promise<Map<string, QuestFacts>> {
  const out = new Map<string, QuestFacts>(personIds.map((id) => [id, { party: [], given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] }]));
  if (personIds.length === 0) return out;
  const [own, given, hosted] = await Promise.all([
    mustPagesIn<PartyRow>(personIds, "[quests/act-facts] own party rows", (ids, from, to) =>
      selectQuestParty("id, quest_id, head_id, person_id, standing, accepted_at, turn_in_url, turned_in_at, created_at").in("person_id", ids).in("standing", ["accepted", "turned_in"]).order("id").range(from, to),
    ),
    mustPagesIn<QuestRow>(personIds, "[quests/act-facts] quests given", (ids, from, to) => selectQuests(QUEST_COLUMNS).in("giver_id", ids).order("id").range(from, to)),
    mustPagesIn<QuestRow>(personIds, "[quests/act-facts] raids hosted", (ids, from, to) => selectQuests(QUEST_COLUMNS).eq("kind", "raid").in("host_id", ids).order("id").range(from, to)),
  ]);
  const quests = new Map<string, QuestRow>([...given, ...hosted].map((q) => [q.id, q]));
  const missing = [...new Set(own.map((p) => p.quest_id))].filter((id) => !quests.has(id));
  for (const q of await mustPagesIn<QuestRow>(missing, "[quests/act-facts] quests of party rows", (ids, from, to) => selectQuests(QUEST_COLUMNS).in("id", ids).order("id").range(from, to))) quests.set(q.id, q);
  const questIds = [...quests.keys()];
  const sessionIds = [...new Set(hosted.map((q) => q.training_id).filter((id): id is string => id !== null))];
  const [heads, party, reactions, sessions] = await Promise.all([
    mustPagesIn<{ id: string; quest_id: string }>(questIds, "[quests/act-facts] heads", (ids, from, to) => selectQuestHeads("id, quest_id").in("quest_id", ids).order("id").range(from, to)),
    // Who is in each Party, for its size and for whose Turn-in a Reaction answers; never their standing.
    mustPagesIn<{ id: string; quest_id: string; person_id: string }>(questIds, "[quests/act-facts] party members", (ids, from, to) => selectQuestParty("id, quest_id, person_id").in("quest_id", ids).order("id").range(from, to)),
    mustPagesIn<ReactionRow>(questIds, "[quests/act-facts] reactions", (ids, from, to) => selectQuestReactions("id, quest_id, party_id, created_at").in("quest_id", ids).order("id").range(from, to)),
    fireSessions(sessionIds),
  ]);
  const headsOf = new Map<string, string[]>();
  for (const h of heads) headsOf.set(h.quest_id, [...(headsOf.get(h.quest_id) ?? []), h.id]);
  const membersOf = new Map<string, Set<string>>();
  const personOfRow = new Map<string, string>();
  for (const p of party) {
    membersOf.set(p.quest_id, (membersOf.get(p.quest_id) ?? new Set()).add(p.person_id));
    personOfRow.set(p.id, p.person_id);
  }
  const facts = new Map<string, QuestFact>();
  for (const q of quests.values()) {
    const headIds = headsOf.get(q.id) ?? [];
    const partySize = membersOf.get(q.id)?.size ?? 0;
    facts.set(q.id, {
      id: q.id,
      kind: q.kind,
      state: q.state,
      giverId: q.giver_id,
      hostId: q.host_id,
      learning: q.learning,
      required: q.required,
      trainingId: q.training_id,
      headIds,
      partySize,
      monster: monsterFor(partySize, headIds.length),
      at: q.created_at,
    });
  }
  for (const p of own) {
    const quest = facts.get(p.quest_id);
    if (!quest) continue;
    out.get(p.person_id)?.party.push({ id: p.id, headId: p.head_id, standing: p.standing, acceptedAt: p.accepted_at, turnInUrl: p.turn_in_url, at: p.turned_in_at ?? p.accepted_at ?? p.created_at, quest });
  }
  for (const q of given) out.get(q.giver_id)?.given.push(facts.get(q.id) as QuestFact);
  for (const q of hosted) {
    if (!q.host_id) continue;
    // A Raid with no session, or one Training no longer knows, is neither lit nor held.
    const session = q.training_id ? sessions.get(q.training_id) : undefined;
    out.get(q.host_id)?.hosted.push({ quest: facts.get(q.id) as QuestFact, lit: session !== undefined && !session.cancelled, held: isHeld(q.host_id, session, now), attended: session?.attended ?? [] });
  }
  for (const r of reactions) {
    const quest = facts.get(r.quest_id);
    const turnInBy = personOfRow.get(r.party_id);
    if (!quest || !turnInBy) continue;
    const fact: ReactionFact = { id: r.id, questId: r.quest_id, giverId: quest.giverId, turnInBy, at: r.created_at };
    out.get(quest.giverId)?.reactionsGiven.push(fact);
    if (turnInBy !== quest.giverId) out.get(turnInBy)?.reactionsReceived.push(fact);
  }
  return out;
}
