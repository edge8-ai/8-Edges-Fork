import { companyOs } from "@/kernel/data/supabase";

// The client companies with an active AI program, grouped, with the caller's
// own companies left out. The weekly client status opens one report per company
// in this list, and the automation watchdog (Z.15.2) checks that each one got
// its report, so both read it here: two copies of the list are how the run and
// its check would come to disagree about who is a client. The
// names of a deployment's own companies are the caller's to pass, because they
// are that deployment's data, not this entity's.

export type ActiveClient = { company: string; programIds: string[] };

export type ProgramRow = { id: string; company_id: string; company: { name: string } | { name: string }[] | null };

/** Active client companies by company id, or the read's error. */
export async function activeClientCompanies(internal: ReadonlySet<string>): Promise<
  { ok: true; clients: Map<string, ActiveClient> } | { ok: false; error: string }
> {
  const { data, error } = await companyOs
    .from("ai_programs")
    .select("id, company_id, company:companies!company_id(name)")
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true, clients: groupActiveClients((data ?? []) as unknown as ProgramRow[], internal) };
}

/** Active program rows grouped by client company, our own companies left out. */
export function groupActiveClients(rows: ProgramRow[], internal: ReadonlySet<string>): Map<string, ActiveClient> {
  const clients = new Map<string, ActiveClient>();
  for (const p of rows) {
    const company = (Array.isArray(p.company) ? p.company[0]?.name : p.company?.name) ?? "";
    if (!company || internal.has(company)) continue;
    const entry = clients.get(p.company_id) ?? { company, programIds: [] };
    entry.programIds.push(p.id);
    clients.set(p.company_id, entry);
  }
  return clients;
}
