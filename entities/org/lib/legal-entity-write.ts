// The one way a checked change reaches company_os.legal_entities: a
// compare-and-set update, then the audit row that names what moved and why.
//
// Compare-and-set because two people can have the drawer open at once (a
// Super Admin renaming the company while Finance enters its tax code). The
// update matches only while every column it changes still holds what the
// change was checked against, so the second save finds no row and is told to
// reload, instead of silently overwriting a value its author never saw.
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { LEGAL_ENTITIES_AUDIT_TABLE } from "./legal-entities";
import type { LegalEntityRecord } from "./legal-entity-changes";
import { insertLegalEntities, updateLegalEntities } from "./writes";

export const STALE_CHANGE = "Someone changed this legal entity after you opened it. Reload the page and make your change again.";

/** The columns a checked change may write: the company's own and its registration details. */
type Patch = TablesUpdate<{ schema: "company_os" }, "legal_entities">;

/** Write a checked change to one legal entity and record it. */
export async function writeLegalEntityChange(
  record: LegalEntityRecord,
  patch: Partial<Record<keyof LegalEntityRecord, string | boolean>>,
  by: { actor: string | null; reason: string },
): Promise<Result> {
  const columns = Object.keys(patch) as (keyof LegalEntityRecord)[];
  // The patch comes from checkCompany or checkRegistration, which give each
  // column a value of its own type (active the boolean, the rest text); the
  // generic record type they share cannot say so column by column.
  let query = updateLegalEntities(patch as Patch).eq("id", record.id);
  const oldData: Record<string, unknown> = {};
  for (const column of columns) {
    const stored = record[column];
    oldData[column] = stored;
    query = stored === null ? query.is(column, null) : query.eq(column, stored);
  }
  const { data, error } = await query.select("id");
  if (error) return { ok: false, error: `Could not save the change: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, error: STALE_CHANGE };

  await recordAudit({
    table: LEGAL_ENTITIES_AUDIT_TABLE,
    recordId: record.id,
    operation: "update",
    actor: by.actor,
    oldData,
    newData: { ...patch },
    context: { reason: by.reason },
  });
  return { ok: true };
}

/** Postgres' unique_violation: the slug was taken between the check and the insert. */
const UNIQUE_VIOLATION = "23505";

/** Insert a new legal entity and record it. */
export async function insertLegalEntity(
  row: { slug: string; name: string; legal_name: string; country: string; entity_type: string; base_currency: string },
  by: { actor: string | null; reason: string },
): Promise<Result & { id?: string }> {
  const { data, error } = await insertLegalEntities(row).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) return { ok: false, error: `Another legal entity already uses the address ${row.slug}. Change the name.` };
    return { ok: false, error: `Could not add the legal entity: ${error.message}` };
  }
  const id = (data as { id: string } | null)?.id;
  if (!id) return { ok: false, error: "Could not add the legal entity: the database returned no row." };

  await recordAudit({
    table: LEGAL_ENTITIES_AUDIT_TABLE,
    recordId: id,
    operation: "insert",
    actor: by.actor,
    newData: { ...row },
    context: { reason: by.reason },
  });
  return { ok: true, id };
}
