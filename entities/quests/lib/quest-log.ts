// The quest log: the self audience (spec 2026-10-20, "One read model, three
// audiences"; ADR 0020; QS.3 as amended 2026-10-21, the part LD.6 mounts on
// the profile's Quest log tab). Every quest the reader was on, with their own
// Standing on each head, Missed included, newest first. It takes the reader and
// answers about the reader alone: it reads only party rows whose person is the
// reader, so no other person's standing, and nobody's name, is ever selected.
// A Missed is seen here by its owner only, as ADR 0020 has it.
//
// The fetch and the shaping are split, as the Quests page's read is, so the
// audience rule is tested on rows in memory.
import { mustPagesIn } from "@/kernel/data/read";
import { selectQuestHeads, selectQuestParty, selectQuests } from "./reads";
import type { QuestKind, QuestState, Standing } from "./standing";

export type QuestLogHead = { position: number; ask: string; standing: Standing; late: boolean };

export type QuestLogEntry = {
  id: string;
  kind: QuestKind;
  title: string;
  state: QuestState;
  /** When the reader last moved on it, or when it was summoned if they never did. */
  at: string;
  /** The heads the reader was on, in the Giver's order, each with the reader's own Standing. */
  heads: QuestLogHead[];
};

type OwnRow = { quest_id: string; head_id: string; person_id: string; standing: Standing; late: boolean; accepted_at: string | null; turned_in_at: string | null; handed_back_at: string | null; missed_at: string | null; created_at: string };
type LogQuestRow = { id: string; kind: QuestKind; title: string; state: QuestState; created_at: string };
type LogHeadRow = { id: string; quest_id: string; position: number; ask: string };

const latest = (times: (string | null)[]): string | null => times.filter((t): t is string => Boolean(t)).sort().at(-1) ?? null;

/**
 * The reader's quest log from rows. Only the reader's own party rows are read;
 * any other person's row handed in is ignored, so a careless fetch cannot widen
 * the answer.
 */
export function shapeQuestLog(readerPersonId: string, rows: { party: OwnRow[]; quests: LogQuestRow[]; heads: LogHeadRow[] }): QuestLogEntry[] {
  const mine = rows.party.filter((r) => r.person_id === readerPersonId);
  const headById = new Map(rows.heads.map((h) => [h.id, h]));
  const entries: QuestLogEntry[] = [];
  for (const quest of rows.quests) {
    const own = mine.filter((r) => r.quest_id === quest.id);
    if (own.length === 0) continue;
    const heads = own
      .map((r) => ({ row: r, head: headById.get(r.head_id) }))
      .filter((x): x is { row: OwnRow; head: LogHeadRow } => Boolean(x.head))
      .sort((a, b) => a.head.position - b.head.position)
      .map(({ row, head }) => ({ position: head.position, ask: head.ask, standing: row.standing, late: row.late }));
    const at = latest(own.flatMap((r) => [r.accepted_at, r.turned_in_at, r.handed_back_at, r.missed_at])) ?? quest.created_at;
    entries.push({ id: quest.id, kind: quest.kind, title: quest.title, state: quest.state, at, heads });
  }
  return entries.sort((a, b) => b.at.localeCompare(a.at) || a.title.localeCompare(b.title));
}

/** The reader's own quest log: every quest they were on, with their Standing on each head, newest first. */
export async function questLogOf(reader: { personId: string }): Promise<QuestLogEntry[]> {
  const party = await mustPagesIn<OwnRow>([reader.personId], "[quests/log] own party rows", (ids, from, to) =>
    selectQuestParty("id, quest_id, head_id, person_id, standing, late, accepted_at, turned_in_at, handed_back_at, missed_at, created_at").in("person_id", ids).order("id").range(from, to),
  );
  const questIds = [...new Set(party.map((r) => r.quest_id))];
  if (questIds.length === 0) return [];
  const [quests, heads] = await Promise.all([
    mustPagesIn<LogQuestRow>(questIds, "[quests/log] quests", (ids, from, to) => selectQuests("id, kind, title, state, created_at").in("id", ids).order("id").range(from, to)),
    mustPagesIn<LogHeadRow>(questIds, "[quests/log] heads", (ids, from, to) => selectQuestHeads("id, quest_id, position, ask").in("quest_id", ids).order("id").range(from, to)),
  ]);
  return shapeQuestLog(reader.personId, { party, quests, heads });
}
