// One question for the ladders (LD.1; ADR 0021): the register of a set of
// sessions, as Training keeps it. For each session asked about: whether it was
// self-logged, and who was marked attended and not removed. Training states
// these and judges nothing (ADR 0016, ADR 0028): when a session ends and
// whether it was cancelled are taughtSessions' to state, and whether a Raid's
// session was a held fire is Quests' to judge (ADR 0023, evolve-model.isHeld).
//
// Batched by session id, chunked to keep each request's URL short.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

/** A session's register. A session Training does not know is absent from the map. */
export type SessionRegister = {
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
      mustRows(await companyOs.from("trainings").select("id, self_logged").in("id", ids), "[training/registers] trainings") as { id: string; self_logged: boolean }[],
      mustRows(
        await companyOs.from("training_attendance").select("training_id, person_id").in("training_id", ids).eq("status", "attended").is("removed_at", null),
        "[training/registers] training_attendance",
      ) as { training_id: string; person_id: string }[],
    ]);
    for (const s of sessions) out.set(s.id, { selfLogged: s.self_logged, attended: [] });
    for (const a of attendance) out.get(a.training_id)?.attended.push(a.person_id);
  }
  return out;
}
