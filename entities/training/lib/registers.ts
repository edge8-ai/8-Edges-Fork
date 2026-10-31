// One question for the ladders (LD.1; ADR 0021): the register of a set of
// sessions, as Training keeps it. For each session asked about: whether it was
// held (exists and not cancelled), whether it was self-logged, and who was
// marked attended and not removed. A Raid's Host earns a fire only when
// someone other than them came (the ladders' rule, entities/ladders/lib/points.ts);
// Training answers who came and judges nothing (ADR 0016).
//
// Batched by session id, chunked to keep each request's URL short.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

export type SessionRegister = {
  /** False when the session is cancelled. A session Training does not know is absent from the map. */
  held: boolean;
  selfLogged: boolean;
  /** The people (company_os.people) marked attended, not removed. */
  attended: string[];
};

const CHUNK = 100;

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** The register of each session asked about. */
export async function sessionRegisters(trainingIds: readonly string[]): Promise<Map<string, SessionRegister>> {
  const out = new Map<string, SessionRegister>();
  for (const ids of chunks(trainingIds)) {
    const [sessions, attendance] = await Promise.all([
      mustRows(await companyOs.from("trainings").select("id, cancelled_at, self_logged").in("id", ids), "[training/registers] trainings") as { id: string; cancelled_at: string | null; self_logged: boolean }[],
      mustRows(
        await companyOs.from("training_attendance").select("training_id, person_id").in("training_id", ids).eq("status", "attended").is("removed_at", null),
        "[training/registers] training_attendance",
      ) as { training_id: string; person_id: string }[],
    ]);
    for (const s of sessions) out.set(s.id, { held: s.cancelled_at === null, selfLogged: s.self_logged, attended: [] });
    for (const a of attendance) out.get(a.training_id)?.attended.push(a.person_id);
  }
  return out;
}
