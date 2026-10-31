// Who hosts a Raid, for the ladders (LD.2; ADR 0021): their attendance
// subscriber asks it of a register mark, to know whose fire the mark may
// light. What a person did on Quests, points and badges alike, is one read
// since A.76 (act-facts.ts, ADR 0023).
//
// Batched by session; the ids are chunked to keep each request's URL short.
import { mustRows } from "@/kernel/data/read";
import { selectQuests } from "./reads";

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
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
