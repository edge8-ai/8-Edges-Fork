// The manager audience (QS.3; spec 2026-10-20, "One read model, three
// audiences" and "Access"; ADR 0020). For ONE Bounty, where each person the
// reader may follow up stands on each head, Missed included. The party
// audience (quests-read.ts) never names who is out and the self audience
// (quest-log.ts) answers about the reader alone; this is the only read that
// names another person's Missed, so who it reaches is decided here once, for
// the admin report and for the assistant's per-quest question (QS.9) alike.
//
// Who the reader reaches on a quest (ADR 0020):
// - everyone their quests.report reach covers: a manager their direct reports
//   (scope team), an admin everyone (scope all). The atom's reach is the
//   kernel's (access.may), so this file never works out who reports to whom;
// - and everyone the quest called when standing.ts's seesWhoWasCalled says the
//   reader may see them: they gave it and it is required. The Quests page asks
//   the same predicate for the Giver's own party (QS.10), so the two audiences
//   cannot disagree about it.
// A reader who does not hold quests.report reaches nobody here, their own
// required Bounty included: the manager audience is the atom's, and a Giver
// who is no longer a manager still sees their party on the Quests page.
//
// Every read is about one quest. The functions take one quest id and answer
// for that quest alone; nothing here, or anywhere in the entity, returns or
// totals a person's misses across quests ("missed 4 of the last 6"), and
// quest-report.test.ts fails a read that would.
//
// The fetch and the shaping are split, as the page's read is, so the audience
// rules are tested on rows in memory.
import type { Access } from "@/kernel/identity/access-model";
import { isUuid } from "@/kernel/config/slug";
import { mustPages, mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { HEAD_COLUMNS, PARTY_COLUMNS, QUEST_COLUMNS, type HeadRow, type PartyDbRow, type QuestRow } from "./rows";
import { selectQuestHeads, selectQuestParty, selectQuests } from "./reads";
import { hasClosed, seesWhoWasCalled, type Standing } from "./standing";

/** The atom the manager audience is read under. */
const REPORT_ATOM = "quests.report";

/**
 * Who reads the report: their people.id (null for an env-only admin with no
 * person record, who gave no quest) and their access, as the page's guard
 * returned it.
 */
export type ReportReader = { personId: string | null; access: Pick<Access, "may"> };

type ReportHead = {
  id: string;
  position: number;
  ask: string;
  /** The due time, ISO timestamptz. */
  closesAt: string;
  closed: boolean;
};

/** One person's Standing on one head; `late` is a Turn-in that arrived after the head closed, which counts in full. */
export type ReportCell = { standing: Standing; late: boolean };

type ReportRow = {
  personId: string;
  name: string;
  /** One cell per head, in the heads' order; null where the person was not called on that head. */
  heads: (ReportCell | null)[];
};

export type QuestReport = {
  quest: {
    id: string;
    title: string;
    state: QuestRow["state"];
    required: boolean;
    giverName: string;
    /** When it closed, ISO timestamptz; null while open. */
    closedAt: string | null;
  };
  heads: ReportHead[];
  /** How many people the Giver called, the count the whole party already sees. */
  called: number;
  /** The people the reader reaches on this quest, anyone with a Missed first, then by name. */
  rows: ReportRow[];
};

/** One Bounty in the report's picker: what it is, never who is on it. */
export type ReportQuestOption = { id: string; title: string; state: "open" | "closed"; createdAt: string; closedAt: string | null };

/** Everything one quest's report is shaped from. Rows of other quests may be handed in; they are ignored. */
export type ReportData = {
  quest: QuestRow | null;
  heads: readonly HeadRow[];
  party: readonly PartyDbRow[];
  /** Names by people.id, for the Giver and the people reached. */
  names: ReadonlyMap<string, string>;
};

/**
 * Whether the reader may see where this person stands on this quest (ADR
 * 0020). Always one person on one quest: the question is never asked across
 * quests.
 */
export function reaches(reader: ReportReader, quest: Pick<QuestRow, "giver_id" | "required">, personId: string): boolean {
  if (!reader.access.may(REPORT_ATOM)) return false;
  return reader.access.may(REPORT_ATOM, { person: personId }) || seesWhoWasCalled(quest, reader.personId);
}

/**
 * A row as the report says it. A Withdrawn Bounty has no Missed: withdrawing
 * is refused once a head has closed, so no Missed can be written on one, and a
 * row that says so anyway is read as what it was before, committed and still
 * out. A late Turn-in has already lifted its Missed in the row itself.
 */
function cellOf(row: PartyDbRow, withdrawn: boolean): ReportCell {
  if (withdrawn && row.standing === "missed") return { standing: "accepted", late: false };
  return { standing: row.standing, late: row.standing === "turned_in" && row.late };
}

/**
 * One quest's report for one reader, from rows in memory. Null when the quest
 * is not a Bounty or is not among the rows: a Raid has no heads to stand on
 * and a Beacon is turned in by its own author as it is lit.
 */
export function shapeQuestReport(reader: ReportReader, questId: string, data: ReportData, now: Date): QuestReport | null {
  const quest = data.quest;
  if (!quest || quest.id !== questId || quest.kind !== "bounty") return null;
  const heads: ReportHead[] = data.heads
    .filter((h) => h.quest_id === questId)
    .sort((a, b) => a.position - b.position)
    .map((h) => ({
      id: h.id,
      position: h.position,
      ask: h.ask,
      closesAt: h.closes_at,
      closed: quest.state !== "open" || hasClosed({ closesAt: h.closes_at, closedAt: h.closed_at }, now),
    }));
  const party = data.party.filter((r) => r.quest_id === questId);
  const rowsOf = new Map<string, PartyDbRow[]>();
  for (const r of party) rowsOf.set(r.person_id, [...(rowsOf.get(r.person_id) ?? []), r]);
  const withdrawn = quest.state === "withdrawn";
  const rows: ReportRow[] = [...rowsOf]
    .filter(([personId]) => reaches(reader, quest, personId))
    .map(([personId, own]) => ({
      personId,
      name: data.names.get(personId) ?? "Someone",
      heads: heads.map((h) => {
        const r = own.find((x) => x.head_id === h.id);
        return r ? cellOf(r, withdrawn) : null;
      }),
    }));
  const missedAny = (r: ReportRow) => r.heads.some((c) => c?.standing === "missed");
  rows.sort((a, b) => Number(missedAny(b)) - Number(missedAny(a)) || a.name.localeCompare(b.name));
  return {
    quest: {
      id: quest.id,
      title: quest.title,
      state: quest.state,
      required: quest.required,
      giverName: data.names.get(quest.giver_id) ?? "Someone",
      closedAt: quest.closed_at,
    },
    heads,
    called: rowsOf.size,
    rows,
  };
}

/**
 * One Bounty's report for the reader. Every read raises on failure, because a
 * report that came back empty from a failed read would say nobody missed.
 * A quest id that is not a uuid is no quest, and is answered without a read.
 */
export async function readQuestReport(reader: ReportReader, questId: string, now: Date = new Date()): Promise<QuestReport | null> {
  if (!isUuid(questId)) return null;
  const [questRes, headRes, party] = await Promise.all([
    selectQuests(QUEST_COLUMNS).eq("id", questId),
    selectQuestHeads(HEAD_COLUMNS).eq("quest_id", questId).order("position"),
    mustPages<PartyDbRow>("[quests/report] quest_party", (from, to) => selectQuestParty(PARTY_COLUMNS).eq("quest_id", questId).order("id").range(from, to)),
  ]);
  const quest = (mustRows(questRes, "[quests/report] quest") as unknown as QuestRow[])[0] ?? null;
  if (!quest) return null;
  const heads = mustRows(headRes, "[quests/report] quest_heads") as unknown as HeadRow[];
  // Only the names the report draws: the Giver and the people the reader reaches.
  const reached = [...new Set(party.map((r) => r.person_id))].filter((id) => reaches(reader, quest, id));
  const people = await peopleOnRecord([quest.giver_id, ...reached]);
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return shapeQuestReport(reader, questId, { quest, heads, party, names }, now);
}

type PickerRow = Pick<QuestRow, "id" | "title" | "state" | "created_at" | "closed_at" | "kind">;

/** The picker from rows: open and closed Bounties, newest first. A Withdrawn Bounty has no Missed, so it is not offered. */
export function shapeReportQuests(rows: readonly PickerRow[]): ReportQuestOption[] {
  return rows
    .filter((q): q is PickerRow & { state: "open" | "closed" } => q.kind === "bounty" && (q.state === "open" || q.state === "closed"))
    .map((q) => ({ id: q.id, title: q.title, state: q.state, createdAt: q.created_at, closedAt: q.closed_at }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
}

/** Every open and closed Bounty, newest first, for the report's quest picker. It names no person. */
export async function readReportQuests(): Promise<ReportQuestOption[]> {
  const rows = await mustPages<PickerRow>("[quests/report] bounties", (from, to) =>
    selectQuests("id, title, state, created_at, closed_at, kind").eq("kind", "bounty").in("state", ["open", "closed"]).order("created_at", { ascending: false }).order("id").range(from, to),
  );
  return shapeReportQuests(rows);
}
