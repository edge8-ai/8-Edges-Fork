// What Settings → Legal entities reads: every legal entity with the history of
// its changes, shaped for the screen, and the one row read the actions use
// before they write.
//
// Not named reads.ts: that file holds only the thin select helpers other
// entities reach through the door, and this is a loader.
import { listAuditFor } from "@/kernel/audit/history-read";
import { mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import type { LegalEntityRecord } from "./legal-entity-changes";
import { legalEntityChange, representativeIds, type LegalEntityChange } from "./legal-entity-history";
import { entityTypeLabel } from "./legal-entity-rules";
import { selectLegalEntities } from "./reads";

/** The audit_log table name every legal-entity change is recorded under. */
export const LEGAL_ENTITIES_AUDIT_TABLE = "legal_entities";

/** Every column the screen and the actions read, and the only ones. */
export const LEGAL_ENTITY_COLUMNS =
  "id, slug, name, legal_name, country, entity_type, base_currency, active, tax_id, registration_number, registered_address, legal_representative_person_id, jurisdiction, incorporated_on";

/** How many changes the drawer lists. The history is a reference, not a ledger to page through. */
const HISTORY_LIMIT = 20;

/** One legal entity as the screen shows it. */
export type LegalEntityView = {
  /** The row as stored, which the drawer's checks compare a change against. */
  record: LegalEntityRecord;
  /** The entity's form, as words: "LLC", "Corporation". */
  typeLabel: string | null;
  /** The legal representative's name, when one is named and can be found. */
  representative: string | null;
  /**
   * What is wrong with the legal representative, if anything: none named, or
   * the person named has since been archived. The law needs a current one.
   */
  representativeFlag: string | null;
  /** Newest first. The first one is the row's "last change". */
  history: LegalEntityChange[];
};

/** Read one legal entity, or null when the id names none. Raises on a failed read. */
export async function readLegalEntity(id: string): Promise<LegalEntityRecord | null> {
  const rows = mustRows(await selectLegalEntities(LEGAL_ENTITY_COLUMNS).eq("id", id).limit(1), "[org/legal-entities] legal_entities") as unknown as LegalEntityRecord[];
  return rows[0] ?? null;
}

/** Whether another legal entity already uses this slug. Raises on a failed read. */
export async function legalEntitySlugTaken(slug: string): Promise<boolean> {
  const rows = mustRows(await selectLegalEntities("id").eq("slug", slug).limit(1), "[org/legal-entities] legal_entities slug");
  return rows.length > 0;
}

/**
 * Every legal entity, active ones first, each with its recent changes.
 *
 * Every read raises on failure. A tax code that failed to load must not render
 * as "Not set", because the person reading would type it in again; and a
 * missing history would hide who last changed it.
 */
export async function loadLegalEntities(): Promise<LegalEntityView[]> {
  const records = mustRows(
    await selectLegalEntities(LEGAL_ENTITY_COLUMNS).order("active", { ascending: false }).order("name"),
    "[org/legal-entities] legal_entities",
  ) as unknown as LegalEntityRecord[];

  const histories = await Promise.all(
    records.map((r) => listAuditFor(LEGAL_ENTITIES_AUDIT_TABLE, r.id, { limit: HISTORY_LIMIT, withData: true })),
  );
  const people = await peopleOnRecord([
    ...records.map((r) => r.legal_representative_person_id ?? ""),
    ...histories.flatMap((h) => representativeIds(h.entries)),
  ]);
  const names = new Map([...people].map(([id, p]) => [id, p.name]));

  return records.map((record, i) => {
    const repId = record.legal_representative_person_id;
    const rep = repId ? people.get(repId) : undefined;
    return {
      record,
      typeLabel: entityTypeLabel(record.entity_type),
      representative: rep?.name ?? null,
      // The foreign key sets the column null when a person is deleted, so a
      // named id always resolves; archived is how a person leaves.
      representativeFlag: !repId ? "No legal representative" : rep?.archived ? "Legal representative is archived" : null,
      history: histories[i].entries.map((e) => legalEntityChange(e, { country: record.country, personNames: names })),
    };
  });
}
