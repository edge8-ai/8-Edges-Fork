// The clients a receipt may be tagged to rebill (RB.11): every company not
// archived, by name. `companies` is a kernel table (identity resolves which
// company a portal member belongs to, so no entity owns it), and the kernel's
// own read helper is the door every entity reads it through.
import { selectCompanies } from "@/kernel/identity/reads";
import { mustRows } from "@/kernel/data/read";

export type RebillCompany = { id: string; name: string };

/**
 * The picker's companies. A failed read throws: an empty picker would read
 * as "there are no clients", and the tag could not be set at all.
 */
export async function listRebillCompanies(): Promise<RebillCompany[]> {
  const rows = mustRows(
    await selectCompanies("id, name").is("archived_at", null).order("name").limit(1000),
    "[reimbursements] companies to rebill",
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? "") }));
}
