// One question for the ladders (LD.1; ADR 0021): a person's sparks as Ideas
// records them, each with its kind and whether it is archived. A spark or a
// learning earns the same on the Learn & Share ladder and an archived one
// earns nothing; that is the ladders' rule (entities/ladders/lib/points.ts),
// and Ideas only says what the person posted.
//
// Batched by person, chunked to keep each request's URL short.
import { mustRows } from "@/kernel/data/read";
import { selectIdeas } from "./reads";

export type SparkAct = { kind: "build" | "learning"; archived: boolean };

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Each person's sparks; a person with none gets an empty list. */
export async function sparksOf(personIds: readonly string[]): Promise<Map<string, SparkAct[]>> {
  const out = new Map<string, SparkAct[]>(personIds.map((id) => [id, []]));
  for (const ids of chunks(personIds)) {
    const rows = mustRows(await selectIdeas("person_id, kind, status").in("person_id", ids), "[ideas/acts] ideas") as unknown as { person_id: string; kind: "build" | "learning"; status: string }[];
    for (const row of rows) out.get(row.person_id)?.push({ kind: row.kind, archived: row.status === "archived" });
  }
  return out;
}
