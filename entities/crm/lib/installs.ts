import { companyOs } from "@/kernel/data/supabase";
import { mustCount, mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, personName, type NamedPerson } from "@/kernel/config/people-name";
import type { InstallSource, InstallStatus } from "./installs-shapes";

// Reads of company_os.eight_edges_installs, the CRM's record of every Eight
// Edges open source install (plan: "Eight Edges Installs" in the private library).
// A failed read throws: an installs count of zero because the read failed
// would be the same wrong number the key result showed before.

export type InstallRow = {
  id: string;
  status: InstallStatus;
  source: InstallSource;
  downloadedOn: string;
  installedOn: string | null;
  evidenceUrl: string | null;
  notes: string | null;
  company: { id: string; name: string } | null;
  person: { id: string; name: string; email: string | null } | null;
};

type Joined = { id: string; name: string | null } | { id: string; name: string | null }[] | null;
type Person = NamedPerson & { id: string; email: string | null };
type JoinedPerson = Person | Person[] | null;

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Every live install record, newest download first. */
export async function listEightEdgesInstalls(): Promise<InstallRow[]> {
  const rows = mustRows(
    await companyOs
      .from("eight_edges_installs")
      .select(
        `id, status, source, downloaded_on, installed_on, evidence_url, notes, company:companies!eight_edges_installs_company_id_fkey(id, name), person:people!eight_edges_installs_person_id_fkey(id, ${NAME_COLUMNS})`,
      )
      .is("archived_at", null)
      .order("downloaded_on", { ascending: false })
      .order("created_at", { ascending: false }),
    "[crm/installs] eight_edges_installs",
  );
  return rows.map((r) => {
    const company = one(r.company as Joined);
    const person = one(r.person as JoinedPerson);
    return {
      id: r.id,
      status: r.status as InstallStatus,
      source: r.source as InstallSource,
      downloadedOn: r.downloaded_on,
      installedOn: r.installed_on,
      evidenceUrl: r.evidence_url,
      notes: r.notes,
      company: company ? { id: company.id, name: company.name ?? "Unnamed company" } : null,
      person: person ? { id: person.id, name: personName(person), email: person.email } : null,
    };
  });
}

/**
 * The installs number the company key result "88 installations by Dec 31"
 * shows: live records with status installed. Downloads and abandoned copies do
 * not count. Read by the org entity's nightly Key result sync.
 */
export async function countEightEdgesInstalls(): Promise<number> {
  return mustCount(
    await companyOs
      .from("eight_edges_installs")
      .select("id", { count: "exact", head: true })
      .eq("status", "installed")
      .is("archived_at", null),
    "[crm/installs] installed count",
  );
}

export type InstallSummary = { installed: number; downloadsThisYear: number; waiting: number };

/** The page's three tiles, from the rows it already read. */
export function summarizeInstalls(rows: InstallRow[], year: number): InstallSummary {
  return {
    installed: rows.filter((r) => r.status === "installed").length,
    downloadsThisYear: rows.filter((r) => r.downloadedOn.startsWith(`${year}-`)).length,
    waiting: rows.filter((r) => r.status === "downloaded").length,
  };
}
