import { ReadFailure } from "@/kernel/data/read";
import { selectAiPrograms } from "./reads";

// "Does this AI Program belong to a company I may act for?" — the question five
// call sites in four entities were each asking for themselves (A.14).
//
// The door helper they used, `selectAiPrograms`, names the table and hands the
// PostgREST builder back, so every caller carried its own columns, its own
// `.eq`/`.in` pair, its own `.maybeSingle()` and its own cast. Two of them
// (portal/lib/program-hub.ts and portal/lib/ai-programs.ts) were five
// byte-identical lines whose hand-written row casts had already drifted apart.
// That is the seam sitting at the wrong height: a helper that only names a
// table leaves the question at the caller, where the type system cannot see it
// and `audit:parity` has to be run by hand to notice a dropped filter.
//
// Naming the question puts the columns, the scope filter and the row shape
// behind one interface, inside the entity that owns the table. This is the
// shape A.5 gave CRM's revenue-metrics.
export type ProgramRef = { id: string; companyId: string };

// A read failure is NOT "not in scope". The callers used to collapse the two —
// a database error produced `null`, which they reported to the person as "That
// program does not belong to this company." So the answer carries its own error
// channel rather than leaning on a nullable row (A.12).
export type ProgramScopeAnswer =
  | { ok: true; program: ProgramRef | null }
  | { ok: false; error: string };

/**
 * The answer, for a loader that has no Result to carry a failure in: the
 * program or null, with a read failure raised for the surface's error boundary.
 * Two portal loaders were each writing this out; an action should forward the
 * `{ ok: false }` instead.
 */
export function programOrRaise(answer: ProgramScopeAnswer, what: string): ProgramRef | null {
  if (!answer.ok) throw new ReadFailure(what, answer.error);
  return answer.program;
}

const toRef = (row: unknown): ProgramRef | null => {
  const r = row as { id: string; company_id: string } | null;
  return r ? { id: r.id, companyId: r.company_id } : null;
};

/** The program, iff it belongs to one of `companyIds`. Empty scope matches nothing. */
export async function programInCompanies(programId: string, companyIds: string[]): Promise<ProgramScopeAnswer> {
  if (!programId || companyIds.length === 0) return { ok: true, program: null };
  const { data, error } = await selectAiPrograms("id, company_id")
    .eq("id", programId)
    .in("company_id", companyIds)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, program: toRef(data) };
}

/** A program with the name a board would be called after. */
export type NamedProgram = ProgramRef & { name: string };

export type ProgramListAnswer =
  | { ok: true; programs: NamedProgram[] }
  | { ok: false; error: string };

/**
 * The live programmes a company is running.
 *
 * Named here rather than assembled by the caller for the reason above: the
 * "live" filter is `status <> 'archived'`, which four call sites already spell
 * out for themselves, and a fifth copy in another entity is how one screen
 * would start counting archived programmes.
 *
 * Added for boards' `deal.won` subscriber (S.2), which opens the delivery board
 * of every programme the winning account is running.
 */
export async function liveProgramsForCompany(companyId: string): Promise<ProgramListAnswer> {
  if (!companyId) return { ok: true, programs: [] };
  const { data, error } = await selectAiPrograms("id, company_id, name")
    .eq("company_id", companyId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as { id: string; company_id: string; name: string }[];
  return { ok: true, programs: rows.map((r) => ({ id: r.id, companyId: r.company_id, name: r.name })) };
}

/** The program, iff it belongs to this one company. */
export async function programInCompany(programId: string, companyId: string): Promise<ProgramScopeAnswer> {
  if (!programId || !companyId) return { ok: true, program: null };
  const { data, error } = await selectAiPrograms("id, company_id")
    .eq("id", programId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, program: toRef(data) };
}
