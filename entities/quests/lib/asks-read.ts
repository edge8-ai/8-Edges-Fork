// The Asks page's read model (AK.2; spec docs/engineering/2026-11-16-asks-spec.md,
// "One new read for the page"; ADR 0036). An Ask is a Bounty with one head, so
// the page lists heads, in three lists: what a manager or an admin asked of the
// reader and they have not answered (Waiting on you), what the reader asked
// (You asked), and the optional asks the reader was included in and has not
// answered (Open to anyone). A fourth list keeps the asks that closed in the
// last two weeks (AK.8): a required one the reader has not answered, which
// still takes a late answer, and the reader's own, whose answers they can still
// read and thank. Whether the reader still owes a head is the rule
// the assistant's "what is open for me" asks (standing.headOwed), so the page,
// the sidebar's count and the assistant list the same asks.
//
// ADR 0020 is kept here once, as the Quests page's read keeps it: the asker is
// told how many were asked and how many answered, and shown who answered, never
// who is still out. There is no decline to show: a required ask cannot be
// declined (AK.9; standing.ts has no decline move since AK.12). Unlike the
// Quests page, that holds for a manager's required ask too (ADR 0036). AskYouMade has no field
// that could carry a person still out, and the read looks up only the names the
// page shows (namesShown), so a name it never fetched cannot reach the page.
//
// The fetch and the shaping are split, as in quests-read.ts: readAsksPage reads
// the rows and shapeAsksPage, which is pure, turns them into the page, so the
// audience rules are tested on rows in memory.
import { mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { initials } from "@/kernel/ui/format";
import type { Portrait } from "./party-picker";
import { allPartyRows } from "./quests-read";
import { ASK_PARTY_COLUMNS, HEAD_COLUMNS, QUEST_COLUMNS, type AskPartyDbRow, type HeadRow, type QuestRow, type ReactionRow } from "./rows";
import { selectQuestHeads, selectQuestParty, selectQuestReactions, selectQuests } from "./reads";
import { headFactsOf, headOwed, headShownClosed, STILL_OUT, withdraw, type QuestState, type Standing } from "./standing";

/** One ask made of the reader: a head of an open Bounty on which their own row is still out. */
export type AskOfYou = {
  questId: string;
  headId: string;
  asker: Portrait;
  /** What is asked: the head's ask. */
  ask: string;
  /** The Bounty's title, when it says something the ask does not; null otherwise. */
  title: string | null;
  /** The asker's opening note; null when they left it empty. */
  note: string | null;
  /** The due time, ISO timestamptz; the page says it in Saigon. */
  dueAt: string;
  /** How many have answered this head so far: a count, never who. */
  answered: number;
};

/** One answer to an ask the reader made. */
export type AnswerToYou = {
  who: Portrait;
  text: string | null;
  url: string | null;
  /** When it was answered, ISO. */
  at: string;
  /** Answered after the due time: the model records it as late, and the asker's card tags it Late (AK.9). */
  late: boolean;
  /** The reader has thanked it. There is at most one Thanks per answer. */
  thanked: boolean;
  /** Whether the reader may still thank it: not yet thanked, and not their own answer. */
  canThank: boolean;
};

/** One open ask the reader made: how it stands, with no field for anyone still out. */
export type AskYouMade = {
  questId: string;
  headId: string;
  ask: string;
  title: string | null;
  dueAt: string;
  /** How many people were asked: a count. */
  asked: number;
  /** How many answered. */
  answered: number;
  /** Newest first. */
  answers: AnswerToYou[];
  /** Withdrawing is open until a due time passes; after that the ask closes instead (standing.withdraw). */
  canWithdraw: boolean;
};

/**
 * An ask that closed in the last two weeks (AK.8): a required one made of the
 * reader that they have not answered, which still takes a late answer, or one
 * the reader made, whose answers they can still read and thank.
 */
export type ClosedAsk = { kind: "of_you"; closedAt: string; ask: AskOfYou } | { kind: "you_made"; closedAt: string; ask: AskYouMade };

export type AsksPage = {
  /** Required asks made of the reader, soonest due first. */
  waiting: AskOfYou[];
  /** The reader's own open asks, soonest due first. */
  asked: AskYouMade[];
  /** Optional asks the reader was included in and has not answered, soonest due first. */
  open: AskOfYou[];
  /** Asks that closed in the last two weeks, newest closed first. */
  closed: ClosedAsk[];
};

/** How long a closed ask stays on the page: two weeks, the window the approved page's footer named (AK.8). */
const CLOSED_WINDOW_DAYS = 14;

/** The earliest close the page still shows, ISO: the read asks the database for closes since then. */
function closedSince(now: Date): string {
  return new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000).toISOString();
}

/**
 * The Standings that may still answer a closed required head: still out, or
 * Missed. standing.openMoves keeps Turn-in open on a closed head for anyone who
 * has not answered, and a late answer lifts a Missed and is recorded as late.
 */
const ANSWERS_LATE = [...STILL_OUT, "missed"] as const satisfies readonly Standing[];

/**
 * When a head closed: its own close, else its quest's (Close now), else its due
 * time, which is when it closed for anyone reading before the clock's next run.
 */
function closedAtOf(quest: QuestRow, head: HeadRow): string {
  return head.closed_at ?? quest.closed_at ?? head.closes_at;
}

/** Everything the page is shaped from, read once. */
export type AsksData = {
  quests: QuestRow[];
  heads: HeadRow[];
  /** The reader's own rows still out, and every row on the asks the reader gave. */
  party: AskPartyDbRow[];
  /** How many rows answered each head of the asks made of the reader, by head id. */
  answeredOn: ReadonlyMap<string, number>;
  /** The party rows the reader has thanked. */
  thanked: ReadonlySet<string>;
  /** Names by people.id, for the people namesShown returned and nobody else. */
  names: ReadonlyMap<string, string>;
};

function portrait(personId: string, names: ReadonlyMap<string, string>): Portrait {
  const name = names.get(personId) ?? "Someone";
  return { personId, name, initials: initials(name) };
}

/** The Bounty's title beside its ask, unless the ask already says it (an ask posted from the Asks page is titled with its own words). */
function titleBeside(title: string, ask: string): string | null {
  const t = title.trim();
  return t && !ask.trim().startsWith(t.replace(/…$/, "")) ? t : null;
}

const bySoonest = <T extends { dueAt: string }>(items: T[]): T[] => [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt));

function askOfYou(quest: QuestRow, head: HeadRow, data: AsksData): AskOfYou {
  return {
    questId: quest.id,
    headId: head.id,
    asker: portrait(quest.giver_id, data.names),
    ask: head.ask,
    title: titleBeside(quest.title, head.ask),
    note: quest.ask.trim() || null,
    dueAt: head.closes_at,
    answered: data.answeredOn.get(head.id) ?? 0,
  };
}

function askYouMade(quest: QuestRow, head: HeadRow, questHeads: HeadRow[], data: AsksData, reader: string, now: Date): AskYouMade {
  const rows = data.party.filter((r) => r.quest_id === quest.id && r.head_id === head.id);
  const newest = (a: string, b: string) => b.localeCompare(a);
  const answers = rows
    .filter((r) => r.standing === "turned_in")
    .map((r): AnswerToYou => {
      const thanked = data.thanked.has(r.id);
      return { who: portrait(r.person_id, data.names), text: r.turn_in_text, url: r.turn_in_url, at: r.turned_in_at ?? "", late: r.late, thanked, canThank: !thanked && r.person_id !== reader };
    })
    .sort((a, b) => newest(a.at, b.at));
  const facts = { kind: quest.kind, state: quest.state, giverId: quest.giver_id, required: quest.required };
  return {
    questId: quest.id,
    headId: head.id,
    ask: head.ask,
    title: titleBeside(quest.title, head.ask),
    dueAt: head.closes_at,
    asked: rows.length,
    answered: answers.length,
    answers,
    canWithdraw: "write" in withdraw(facts, questHeads.map(headFactsOf), reader, now),
  };
}

/**
 * The page for one reader, from rows in memory. Bounties are asks and a Raid or
 * a Beacon never was; a withdrawn one has left the page. An open head is in
 * Waiting on you, You asked or Open to anyone; a head that closed in the last
 * two weeks is in the closed list while it still has something for the reader
 * (AK.8): a required ask they have not answered, or one they made. An optional
 * ask, and one the reader answered, leaves at its close.
 */
export function shapeAsksPage(data: AsksData, reader: string, now: Date): AsksPage {
  const quests = new Map(data.quests.filter((q) => q.kind === "bounty" && q.state !== "withdrawn").map((q) => [q.id, q]));
  const heads = new Map(data.heads.map((h) => [h.id, h]));
  const headsOf = (questId: string) => data.heads.filter((h) => h.quest_id === questId).sort((a, b) => a.position - b.position);
  const since = Date.parse(closedSince(now));
  const recent = (closedAt: string) => Date.parse(closedAt) >= since;
  const waiting: AskOfYou[] = [];
  const open: AskOfYou[] = [];
  const closed: ClosedAsk[] = [];
  for (const row of data.party) {
    if (row.person_id !== reader) continue;
    const quest = quests.get(row.quest_id);
    const head = heads.get(row.head_id);
    if (!quest || !head) continue;
    // The reader's own ask is listed once, as the ask they made, open or
    // closed; so the sidebar count, which is Waiting on you's length, leaves it
    // out too (AK.11).
    if (quest.giver_id === reader) continue;
    const facts = headFactsOf(head);
    if (headOwed(row.standing, quest.state, facts, now)) {
      (quest.required ? waiting : open).push(askOfYou(quest, head, data));
      continue;
    }
    if (!quest.required || !headShownClosed(quest.state, facts, now)) continue;
    if (!(ANSWERS_LATE as readonly Standing[]).includes(row.standing)) continue;
    const closedAt = closedAtOf(quest, head);
    if (recent(closedAt)) closed.push({ kind: "of_you", closedAt, ask: askOfYou(quest, head, data) });
  }
  const asked: AskYouMade[] = [];
  for (const quest of quests.values()) {
    if (quest.giver_id !== reader) continue;
    const questHeads = headsOf(quest.id);
    for (const head of questHeads) {
      const made = askYouMade(quest, head, questHeads, data, reader, now);
      if (!headShownClosed(quest.state, headFactsOf(head), now)) {
        asked.push(made);
        continue;
      }
      const closedAt = closedAtOf(quest, head);
      if (recent(closedAt)) closed.push({ kind: "you_made", closedAt, ask: made });
    }
  }
  closed.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
  return { waiting: bySoonest(waiting), asked: bySoonest(asked), open: bySoonest(open), closed };
}

/**
 * The people the page names, and so the only names the read looks up: who
 * asked each ask made of the reader, and on the reader's own asks the people
 * who answered. Nobody still out, nobody Missed, and nobody who handed an
 * optional Bounty back before Asks: the page shows no decline (AK.9).
 */
export function namesShown(data: Pick<AsksData, "quests" | "party">, reader: string): string[] {
  const given = new Set(data.quests.filter((q) => q.giver_id === reader).map((q) => q.id));
  const onRows = new Set(data.party.filter((r) => r.person_id === reader).map((r) => r.quest_id));
  const askers = data.quests.filter((q) => onRows.has(q.id)).map((q) => q.giver_id);
  const answered = data.party.filter((r) => given.has(r.quest_id) && r.standing === "turned_in").map((r) => r.person_id);
  return [...new Set([...askers, ...answered])];
}

/**
 * The reader's own rows still out on open quests: what may be asked of them
 * now. A row left Called on an optional Bounty that closed stays Called for
 * good, so the quest's state is filtered in the query, not after it.
 */
async function readOwnRows(reader: string): Promise<AskPartyDbRow[]> {
  return mustRows(
    await selectQuestParty(`${ASK_PARTY_COLUMNS}, quest:quests!quest_party_quest_id_fkey!inner(state)`)
      .eq("person_id", reader)
      .in("standing", [...STILL_OUT])
      .eq("quest.state", "open"),
    "[quests/asks-read] own rows",
  ) as unknown as AskPartyDbRow[];
}

/**
 * The page's read of the reader's own rows: readOwnRows's, and the rows still
 * out or Missed on required Bounties that closed since `since`, which still
 * take a late answer (AK.8). The Missed rows are the reader's own, and the
 * page has no field that names one (ADR 0020; quest-report.test's scan).
 */
async function readOwnRowsWithClosed(reader: string, since: string): Promise<AskPartyDbRow[]> {
  return mustRows(
    await selectQuestParty(`${ASK_PARTY_COLUMNS}, quest:quests!quest_party_quest_id_fkey!inner(state, required, closed_at)`)
      .eq("person_id", reader)
      .in("standing", ["called", "accepted", "missed"])
      .or(`state.eq.open,and(state.eq.closed,required.is.true,closed_at.gte.${since})`, { referencedTable: "quest" }),
    "[quests/asks-read] own rows, with the closed",
  ) as unknown as AskPartyDbRow[];
}

/** The Bounties among `ids` in one of `states`: the asks the reader's own rows are on. */
async function bountiesIn(ids: string[], states: readonly QuestState[]): Promise<QuestRow[]> {
  if (ids.length === 0) return [];
  return mustRows(await selectQuests(QUEST_COLUMNS).in("id", ids).eq("kind", "bounty").in("state", [...states]), "[quests/asks-read] quests") as unknown as QuestRow[];
}

async function headsOn(ids: string[]): Promise<HeadRow[]> {
  if (ids.length === 0) return [];
  return mustRows(await selectQuestHeads(HEAD_COLUMNS).in("quest_id", ids).order("position"), "[quests/asks-read] quest_heads") as unknown as HeadRow[];
}

/** How many answered each head of the asks made of the reader: head ids only, so nobody is named. */
async function answeredOn(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = mustRows(await selectQuestParty("head_id").in("quest_id", ids).eq("standing", "turned_in"), "[quests/asks-read] answered") as unknown as { head_id: string }[];
  for (const r of rows) counts.set(r.head_id, (counts.get(r.head_id) ?? 0) + 1);
  return counts;
}

async function thankedOn(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = mustRows(await selectQuestReactions("party_id").in("quest_id", ids), "[quests/asks-read] quest_reactions") as unknown as ReactionRow[];
  return new Set(rows.map((r) => r.party_id));
}

/**
 * The Asks page for one reader. Every read raises on failure, because an empty
 * list from a failed read would tell a person nothing is asked of them.
 */
export async function readAsksPage(reader: string, now: Date = new Date()): Promise<AsksPage> {
  // Open asks, and the ones that closed in the window the closed list shows.
  const since = closedSince(now);
  const [own, givenRes] = await Promise.all([
    readOwnRowsWithClosed(reader, since),
    selectQuests(QUEST_COLUMNS).eq("giver_id", reader).eq("kind", "bounty").or(`state.eq.open,and(state.eq.closed,closed_at.gte.${since})`),
  ]);
  const given = mustRows(givenRes, "[quests/asks-read] asks given") as unknown as QuestRow[];
  const givenIds = given.map((q) => q.id);
  const askedOnIds = [...new Set(own.map((r) => r.quest_id))].filter((id) => !givenIds.includes(id));
  if (givenIds.length === 0 && askedOnIds.length === 0) return { waiting: [], asked: [], open: [], closed: [] };
  const [askedOn, heads, givenRows, answered, thanked] = await Promise.all([
    bountiesIn(askedOnIds, ["open", "closed"]),
    headsOn([...givenIds, ...askedOnIds]),
    givenIds.length > 0 ? allPartyRows<AskPartyDbRow>(givenIds, ASK_PARTY_COLUMNS) : Promise.resolve([]),
    answeredOn(askedOnIds),
    thankedOn(givenIds),
  ]);
  // A reader on the party of their own ask has that row in both reads.
  const party = [...new Map([...own, ...givenRows].map((r) => [r.id, r])).values()];
  const quests = [...given, ...askedOn];
  const people = await peopleOnRecord(namesShown({ quests, party }, reader));
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return shapeAsksPage({ quests, heads, party, answeredOn: answered, thanked, names }, reader, now);
}

/**
 * How many asks wait on the reader: the length of the page's Waiting on you,
 * shaped by the same rule from the reader's own rows. The sidebar's count
 * (asks-count.ts) asks it on every team page.
 */
export async function readWaitingCount(reader: string, now: Date): Promise<number> {
  const own = await readOwnRows(reader);
  const ids = [...new Set(own.map((r) => r.quest_id))];
  if (ids.length === 0) return 0;
  const [quests, heads] = await Promise.all([bountiesIn(ids, ["open"]), headsOn(ids)]);
  return shapeAsksPage({ quests, heads, party: own, answeredOn: new Map(), thanked: new Set(), names: new Map() }, reader, now).waiting.length;
}
