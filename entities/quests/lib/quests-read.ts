// The Quests page's read model (QS.1; spec 2026-10-20, "One read model, three
// audiences", "Heads"; ADR 0020). It is the only place that joins party rows
// to names, so the rule that the party never learns who is out is kept here
// once: a head's lit portraits are the people who turned in, and the reader's
// own row is the only other row it describes. The one exception is the Giver
// of a required quest, who was a manager or an admin when they summoned it
// and so may see everyone they called (ADR 0020); it costs no role lookup,
// because `required` already records it. Nothing totals a person's answers
// across quests. The manager report (quest-report.ts) and the quest log
// (quest-log.ts) are separate audiences and are not served from here (QS.3).
//
// The fetch and the shaping are split: readQuestsPage reads the rows and
// shapeQuestsPage, which is pure, turns them into the page, so the audience
// rules are tested on rows in memory.
import { mustCount, mustRows, ReadFailure } from "@/kernel/data/read";
import { countLearningsSince } from "@/entities/ideas";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { initials } from "@/kernel/ui/format";
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import { hp as hpOf, monsterFor, verdictAtClose, type Monster } from "./fight";
import type { Lore } from "./lore";
import type { Campfires } from "./campfires-model";
import type { Lighthouses } from "./lighthouse-model";
import { listStaffPortraits, type Portrait } from "./party-picker";
import { HEAD_COLUMNS, PARTY_COLUMNS, QUEST_COLUMNS, type HeadRow, type PartyDbRow, type QuestRow, type ReactionRow } from "./rows";
import { selectQuestParty, selectQuestReactions, selectQuestHeads, selectQuests } from "./reads";
// seesWhoWasCalled is the one test for whether a reader may see everyone a
// quest called (ADR 0020); the name fetch, the shaping and the manager report
// all ask it, so they cannot drift apart.
import { hasClosed, seesWhoWasCalled, type QuestKind, type Standing } from "./standing";

export type { Monster, Portrait, QuestKind, Standing };

export type HeadCard = {
  id: string;
  position: number;
  ask: string;
  /** The due time, ISO timestamptz; the page shows it in Saigon. */
  closesAt: string;
  closed: boolean;
  /** Turned-in rows on this head. */
  hits: number;
  /** fight.hp(hits, the party counted on this head). */
  hp: number;
  /** Once closed: defeated at or under 30 HP, otherwise got away. Null while open or when withdrawn. */
  verdict: "defeated" | "got_away" | null;
  /** The people who turned in on this head, newest first. Nobody else is ever named. */
  lit: Portrait[];
  /** The reader's own row on this head, or null when they are not on it. */
  mine: { standing: Standing; late: boolean; turnInText: string | null; reacted: boolean } | null;
};

export type QuestCard = {
  id: string;
  kind: QuestKind;
  title: string;
  /** The Giver's opening note; null when they left it empty. */
  ask: string | null;
  giver: Portrait;
  state: "open" | "closed" | "withdrawn";
  learning: boolean;
  /** True when the Giver was a manager or an admin at summon: no Accept move and no hand-back. */
  required: boolean;
  /** How many people the Giver called, counted once each however many heads there are. */
  partySize: number;
  monster: Monster;
  /** One or more, in the Giver's order; a one-head Bounty is the ordinary monster. */
  heads: HeadCard[];
  /** The mean of the open heads' HP (every head's once none is open), for the board card. */
  hp: number;
  isGiver: boolean;
  /** The reader is on the party. */
  isMine: boolean;
  /** The party as its Giver sees it; null for every reader who is not the Giver. */
  giverParty: GiverParty | null;
};

/** One person a manager Giver called, lit once they have turned in on every head they were called on. */
type PartyMember = Portrait & {
  lit: boolean;
  /** Heads turned in, and heads called on: a Hydra's chip says how many heads are in until it lights. */
  headsIn: number;
  heads: number;
};

/**
 * The Giver's own view of their party (ADR 0020). Every Giver sees how many
 * they called. Only the Giver of a required quest, a manager or an admin at
 * summon, sees who: an optional quest's Giver sees the count and the lit
 * portraits the whole party already sees, so posting to everyone is never a
 * way to find out who stays quiet.
 */
export type GiverParty = {
  called: number;
  /** Everyone called, lit first; null on an optional quest. */
  members: PartyMember[] | null;
};

export type QuestsPage = {
  season: { name: string; hits: number; campfires: number; beacons: number; discoveries: number };
  /** The open Bounty with the largest party, or null. */
  boss: QuestCard | null;
  board: QuestCard[];
  me: Portrait;
};

/** How long a closed quest stays on the board; also how far back a manager may name one to the assistant (QS.9). */
export const RECENT_DAYS = 14;

/** Everything the page is shaped from, read once. */
export type QuestsData = {
  quests: QuestRow[];
  heads: HeadRow[];
  party: PartyDbRow[];
  /** The party rows the Giver has reacted to. */
  reactedPartyIds: ReadonlySet<string>;
  /** Names by people.id, for the Givers, the lit and the reader. */
  names: ReadonlyMap<string, string>;
  season: QuestsPage["season"];
};

function portrait(personId: string, names: ReadonlyMap<string, string>): Portrait {
  const name = names.get(personId) ?? "Someone";
  return { personId, name, initials: initials(name) };
}

/**
 * The rows a head's HP is counted over. A hand-back is an answer, not someone
 * still out, so it leaves the count. On an optional Bounty a person still
 * Called when the head closes never opted in, so they are not counted on that
 * head either; while it is open they are, because they may yet answer.
 */
export function countedOnHead(rows: readonly Pick<PartyDbRow, "standing">[], required: boolean, closed: boolean): number {
  return rows.filter((r) => r.standing !== "handed_back" && (required || !closed || r.standing !== "called")).length;
}

function headCard(quest: QuestRow, head: HeadRow, rows: PartyDbRow[], data: QuestsData, reader: string, now: Date): HeadCard {
  const closed = quest.state !== "open" || hasClosed({ closesAt: head.closes_at, closedAt: head.closed_at }, now);
  const turnedIn = rows.filter((r) => r.standing === "turned_in");
  const hits = turnedIn.length;
  const hp = hpOf(hits, countedOnHead(rows, quest.required, closed));
  const own = rows.find((r) => r.person_id === reader) ?? null;
  return {
    id: head.id,
    position: head.position,
    ask: head.ask,
    closesAt: head.closes_at,
    closed,
    hits,
    hp,
    verdict: closed && quest.state !== "withdrawn" ? verdictAtClose(hp) : null,
    lit: [...turnedIn]
      .sort((a, b) => (b.turned_in_at ?? "").localeCompare(a.turned_in_at ?? ""))
      .map((r) => portrait(r.person_id, data.names)),
    mine: own ? { standing: own.standing, late: own.late, turnInText: own.turn_in_text, reacted: data.reactedPartyIds.has(own.id) } : null,
  };
}


function giverPartyOf(quest: QuestRow, party: PartyDbRow[], names: ReadonlyMap<string, string>, reader: string): GiverParty {
  const rowsOf = new Map<string, PartyDbRow[]>();
  for (const r of party) rowsOf.set(r.person_id, [...(rowsOf.get(r.person_id) ?? []), r]);
  if (!seesWhoWasCalled(quest, reader)) return { called: rowsOf.size, members: null };
  const members = [...rowsOf].map(([personId, rows]): PartyMember => {
    const headsIn = rows.filter((r) => r.standing === "turned_in").length;
    return { ...portrait(personId, names), lit: headsIn === rows.length, headsIn, heads: rows.length };
  });
  members.sort((a, b) => Number(b.lit) - Number(a.lit) || a.name.localeCompare(b.name));
  return { called: rowsOf.size, members };
}

function questCard(quest: QuestRow, data: QuestsData, reader: string, now: Date): QuestCard {
  const party = data.party.filter((r) => r.quest_id === quest.id);
  const heads = data.heads
    .filter((h) => h.quest_id === quest.id)
    .sort((a, b) => a.position - b.position)
    .map((h) => headCard(quest, h, party.filter((r) => r.head_id === h.id), data, reader, now));
  const partySize = new Set(party.map((r) => r.person_id)).size;
  const open = heads.filter((h) => !h.closed);
  const pool = open.length > 0 ? open : heads;
  return {
    id: quest.id,
    kind: quest.kind,
    title: quest.title,
    ask: quest.ask.trim() ? quest.ask : null,
    giver: portrait(quest.giver_id, data.names),
    state: quest.state,
    learning: quest.learning,
    required: quest.required,
    partySize,
    monster: monsterFor(partySize, heads.length),
    heads,
    hp: pool.length === 0 ? 100 : Math.round(pool.reduce((sum, h) => sum + h.hp, 0) / pool.length),
    isGiver: quest.giver_id === reader,
    isMine: party.some((r) => r.person_id === reader),
    giverParty: quest.giver_id === reader ? giverPartyOf(quest, party, data.names, reader) : null,
  };
}

/** When a card's next open head is due; closed cards sort after every open one. */
function nextDue(card: QuestCard): string {
  return card.heads.find((h) => !h.closed)?.closesAt ?? "~";
}

/**
 * The page for one reader, from rows in memory. Every reader on the team sees
 * the same board; what differs is only their own row on each head and whether
 * they gave the quest. A withdrawn quest is not on the board.
 */
export function shapeQuestsPage(data: QuestsData, readerPersonId: string, now: Date): QuestsPage {
  // A quest with no heads is a summon whose later insert failed and whose
  // withdraw failed too; it is nobody's to answer, so the board never shows it.
  // A Beacon stands on the horizon (QS.6), never on the board.
  const cards = data.quests.filter((q) => q.state !== "withdrawn" && q.kind !== "beacon").map((q) => questCard(q, data, readerPersonId, now)).filter((c) => c.heads.length > 0);
  const openBounties = cards.filter((c) => c.kind === "bounty" && c.state === "open");
  const boss = [...openBounties].sort((a, b) => b.partySize - a.partySize || nextDue(a).localeCompare(nextDue(b)))[0] ?? null;
  const closedAt = new Map(data.quests.map((q) => [q.id, q.closed_at ?? ""]));
  // The tavern board holds the Bounties other than the boss (version 10, QS.14):
  // a Raid is Campfires' and never has a head, so it never reached the board,
  // and saying so here keeps it off should one ever carry a head.
  const board = cards
    .filter((c) => c !== boss && c.kind === "bounty")
    .sort((a, b) => {
      if (a.state === "open" && b.state === "open") return nextDue(a).localeCompare(nextDue(b));
      if (a.state === "open") return -1;
      if (b.state === "open") return 1;
      return (closedAt.get(b.id) ?? "").localeCompare(closedAt.get(a.id) ?? "");
    });
  return { season: data.season, boss, board, me: portrait(readerPersonId, data.names) };
}

/** The season is the Saigon calendar quarter: its name and the moment it began. */
export function seasonOf(now: Date): { name: string; startsAt: string } {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  const firstMonth = String((q - 1) * 3 + 1).padStart(2, "0");
  return { name: `Q${q} ${y}`, startsAt: new Date(`${y}-${firstMonth}-01T00:00:00+07:00`).toISOString() };
}

/** PostgREST returns at most 1,000 rows a call, so a long party is read a page at a time rather than cut short. */
async function allPartyRows(questIds: string[]): Promise<PartyDbRow[]> {
  const out: PartyDbRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = mustRows(
      await selectQuestParty(PARTY_COLUMNS).in("quest_id", questIds).order("id").range(from, from + PAGE - 1),
      "[quests/read] quest_party",
    ) as unknown as PartyDbRow[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/**
 * The season banner's company totals. The learnings are Spark's, counted
 * through the Ideas door (QS.14): until then the count was a fixed zero, so
 * a season with learnings and nothing else kept the banner hidden.
 *
 * Unlike every other read on the page, a failed count here does not raise.
 * The banner is a company total that decides nothing anyone owes, so a page
 * with no banner is an honest answer, while a page that will not draw takes
 * the boss, the board and the reader's moves with it. The four counts stand
 * or fall together: one failure hides the whole tally, never a partial one
 * whose zero would be wrong.
 */
async function readSeason(now: Date): Promise<QuestsPage["season"]> {
  const { name } = seasonOf(now);
  try {
    return await readSeasonCounts(now);
  } catch (err) {
    if (!(err instanceof ReadFailure)) throw err;
    console.error("[quests/read] season tally, banner hidden:", err.message);
    return { name, hits: 0, campfires: 0, beacons: 0, discoveries: 0 };
  }
}

/** The season's four company totals; any failed count raises. */
async function readSeasonCounts(now: Date): Promise<QuestsPage["season"]> {
  const { name, startsAt } = seasonOf(now);
  const [hits, campfires, beacons, discoveries] = await Promise.all([
    // A hit is a Turn-in on a Bounty; a Beacon's Turn-in is counted as a Beacon lit, not as a hit too (QS.6).
    selectQuestParty("id, quest:quests!quest_party_quest_id_fkey!inner(kind)", { count: "exact", head: true }).eq("standing", "turned_in").eq("quest.kind", "bounty").gte("turned_in_at", startsAt),
    // A Raid withdrawn because its lighting failed half way was never lit.
    selectQuests("id", { count: "exact", head: true }).eq("kind", "raid").not("host_id", "is", null).neq("state", "withdrawn").gte("created_at", startsAt),
    // A Beacon is lit when it is written (QS.6); one withdrawn because lighting failed half way was never lit.
    selectQuests("id", { count: "exact", head: true }).eq("kind", "beacon").not("lit_url", "is", null).neq("state", "withdrawn").gte("created_at", startsAt),
    countLearningsSince(startsAt),
  ]);
  return {
    name,
    hits: mustCount(hits, "[quests/read] season hits"),
    campfires: mustCount(campfires, "[quests/read] season campfires"),
    beacons: mustCount(beacons, "[quests/read] season beacons"),
    discoveries,
  };
}

/**
 * The Quests page for one reader: open quests and those closed in the last
 * fortnight. Every read raises on failure, because an empty board from a failed
 * read would tell a person they owe nothing.
 */
export async function readQuestsPage(readerPersonId: string, now: Date = new Date()): Promise<QuestsPage> {
  const cutoff = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
  const [questRes, season] = await Promise.all([
    // Beacons are the Lighthouses read's (QS.6); the board and the arena never draw one.
    selectQuests(QUEST_COLUMNS).neq("kind", "beacon").or(`state.eq.open,closed_at.gte.${cutoff}`).order("created_at", { ascending: false }),
    readSeason(now),
  ]);
  const quests = mustRows(questRes, "[quests/read] quests") as unknown as QuestRow[];
  const ids = quests.map((q) => q.id);
  let heads: HeadRow[] = [];
  let party: PartyDbRow[] = [];
  let reactions: ReactionRow[] = [];
  if (ids.length > 0) {
    const [headRes, partyRows, reactionRes] = await Promise.all([
      selectQuestHeads(HEAD_COLUMNS).in("quest_id", ids).order("position"),
      allPartyRows(ids),
      selectQuestReactions("party_id").in("quest_id", ids),
    ]);
    heads = mustRows(headRes, "[quests/read] quest_heads") as unknown as HeadRow[];
    party = partyRows;
    reactions = mustRows(reactionRes, "[quests/read] quest_reactions") as unknown as ReactionRow[];
  }
  // Only the people the page names: the Givers, everyone lit, the reader, and
  // everyone on a required quest the reader gave (ADR 0020).
  const givenRequired = new Set(quests.filter((q) => seesWhoWasCalled(q, readerPersonId)).map((q) => q.id));
  const named = [
    readerPersonId,
    ...quests.map((q) => q.giver_id),
    ...party.filter((r) => r.standing === "turned_in" || givenRequired.has(r.quest_id)).map((r) => r.person_id),
  ];
  const people = await peopleOnRecord(named);
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return shapeQuestsPage({ quests, heads, party, reactedPartyIds: new Set(reactions.map((r) => r.party_id)), names, season }, readerPersonId, now);
}

/** Who the summon drawer may call: staff only, people with a current team_members row. */
export async function readParty(): Promise<Portrait[]> {
  return listStaffPortraits();
}

/**
 * Everyone the Quests page draws a face for (LD.4): the reader, every quest's
 * Giver, the lit portraits on every head, the party a Giver sees on their own
 * required quest, the Summon drawer's picker, the author of every learning
 * in the Lore (QS.4), and each burning fire's Host and the faces by it
 * (QS.5; a wanted topic draws no face, so nobody who raised a hand is here),
 * and the author at the foot of every lighthouse (QS.6).
 * The page asks the kernel's faces seam once with this
 * list, so a border costs one read however many faces the page draws. It names
 * nobody the page does not already draw.
 */
export function peopleDrawn(
  page: QuestsPage,
  party: readonly Portrait[],
  lore: Pick<Lore, "entries"> = { entries: [] },
  campfires: Pick<Campfires, "burning"> = { burning: [] },
  lighthouses: Pick<Lighthouses, "lit"> = { lit: [] },
): string[] {
  const ids = new Set<string>([page.me.personId, ...party.map((p) => p.personId), ...lore.entries.map((e) => e.author.personId), ...lighthouses.lit.map((b) => b.author.personId)]);
  for (const fire of campfires.burning) for (const p of [fire.host, ...fire.faces]) ids.add(p.personId);
  for (const card of [...(page.boss ? [page.boss] : []), ...page.board]) {
    ids.add(card.giver.personId);
    for (const head of card.heads) for (const p of head.lit) ids.add(p.personId);
    for (const m of card.giverParty?.members ?? []) ids.add(m.personId);
  }
  return [...ids];
}
