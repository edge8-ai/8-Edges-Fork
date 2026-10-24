// One question for the ladders (LD.1; ADR 0021): a person's acts as Quests
// records them. Their Turn-ins (every turned_in party row, one per head, with
// the quest's kind and state and the Turn-in's link, so the asker can tell a
// hit from a Beacon lit) and the Raids they host, with each Raid's session so
// the asker can fetch its register from Training. Quests says what happened;
// what it is worth is the ladders' rule, not this entity's: nothing here
// levels, ranks or totals anyone (ADR 0019).
//
// Batched by person so a replay over the company asks twice, not twice per
// person; the ids are chunked to keep each request's URL short.
import { mustRows } from "@/kernel/data/read";
import { selectQuestParty, selectQuests } from "./reads";
import type { QuestKind, QuestState } from "./standing";

export type TurnInAct = {
  questKind: QuestKind;
  questState: QuestState;
  late: boolean;
  turnInUrl: string | null;
};

export type RaidHosted = {
  questId: string;
  /** The Raid's Training session, or null while the campfire is cold. */
  trainingId: string | null;
};

export type QuestActs = { turnIns: TurnInAct[]; raids: RaidHosted[] };

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

type PartyRow = { person_id: string; late: boolean; turn_in_url: string | null; quest: { kind: QuestKind; state: QuestState } | null };
type RaidRow = { id: string; host_id: string; training_id: string | null };

/** Each person's Turn-ins and hosted Raids; a person with none gets empty lists. */
export async function questActsOf(personIds: readonly string[]): Promise<Map<string, QuestActs>> {
  const out = new Map<string, QuestActs>(personIds.map((id) => [id, { turnIns: [], raids: [] }]));
  for (const ids of chunks(personIds)) {
    const [party, raids] = await Promise.all([
      mustRows(
        await selectQuestParty("person_id, late, turn_in_url, quest:quests!quest_party_quest_id_fkey(kind, state)").in("person_id", ids).eq("standing", "turned_in"),
        "[quests/acts] quest_party",
      ) as unknown as PartyRow[],
      mustRows(await selectQuests("id, host_id, training_id").eq("kind", "raid").in("host_id", ids), "[quests/acts] quests") as unknown as RaidRow[],
    ]);
    for (const row of party) {
      // A party row always has its quest (the foreign key is not null); the
      // null branch is PostgREST's shape, not a case.
      if (!row.quest) continue;
      out.get(row.person_id)?.turnIns.push({ questKind: row.quest.kind, questState: row.quest.state, late: row.late, turnInUrl: row.turn_in_url });
    }
    for (const row of raids) out.get(row.host_id)?.raids.push({ questId: row.id, trainingId: row.training_id });
  }
  return out;
}

/**
 * Who hosts the Raid behind each Training session asked about (LD.2): the
 * ladders' attendance subscriber asks it of a register mark, to know whose
 * fire the mark may light. A session that is no Raid's is absent from the map.
 */
export async function raidHostsOf(trainingIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const ids of chunks(trainingIds)) {
    const rows = mustRows(await selectQuests("host_id, training_id").eq("kind", "raid").in("training_id", ids), "[quests/acts] raid hosts") as unknown as { host_id: string; training_id: string }[];
    for (const row of rows) out.set(row.training_id, row.host_id);
  }
  return out;
}
