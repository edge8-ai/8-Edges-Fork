import type { PostgrestError } from "@supabase/supabase-js";
import { companyOs } from "@/kernel/data/supabase";
import { updateDeals, deleteDeals } from "./writes";
import { deleteVendors, updateVendors } from "@/entities/finance";

import { recordAudit } from "@/kernel/audit/audit";
import { updateCompanies, deleteCompanies, deletePeople, updatePeople } from "@/kernel/identity/writes";

// Generic archive / restore / guarded-delete for the archivable CRM tables
// (people, companies, deals, vendors). Each writes the audit trail; callers handle
// revalidatePath and any entity-specific side effects. Archive is the safe,
// reversible default; guardedDelete is the GDPR-style hard erasure.

import type { Result } from "@/kernel/data/result";
// Re-exported so the many call sites that take it from this helper keep working;
// the type itself is kernel/data/result.ts.
export type { Result };

export type ArchivableTable = "people" | "companies" | "deals" | "vendors";

// `people` is a kernel/identity table, written only through kernel/identity/writes.ts;
// the other three are this entity's own. The table name is a parameter here,
// which the ownership gate cannot see through (it reads `.from("literal")`),
// so the dispatch is explicit and the gate's dynamic-name check names this
// file's own tables in the literal branches.
type ArchivePatch = { archived_at: string | null; archived_by: string | null };
// Both take the row id and filter on it here, so the builder they return is
// never an unfiltered write (scripts/entity-writers-filtered.test.mjs).
function updateArchivable(table: ArchivableTable, id: string, patch: ArchivePatch) {
  switch (table) {
    case "people":
      return updatePeople(patch).eq("id", id);
    case "companies":
      return updateCompanies(patch).eq("id", id);
    case "deals":
      return updateDeals(patch).eq("id", id);
    case "vendors":
      return updateVendors(patch).eq("id", id);
  }
}
function deleteArchivable(table: ArchivableTable, id: string) {
  switch (table) {
    case "people":
      return deletePeople().eq("id", id);
    case "companies":
      return deleteCompanies().eq("id", id);
    case "deals":
      return deleteDeals().eq("id", id);
    case "vendors":
      return deleteVendors().eq("id", id);
  }
}

// Friendlier names for the relations that can block a hard delete.
const REL_LABEL: Record<string, string> = {
  orders: "orders",
  bookings: "bookings",
  deals: "deals",
  subscriptions: "subscriptions",
  inquiries: "inquiries",
  event_registrations: "event registrations",
  meeting_participants: "meeting history",
  touchpoints: "touchpoints",
  affiliates: "affiliate records",
  applications: "applications",
  job_requisitions: "job requisitions",
  lifecycle_transitions: "lifecycle transitions",
  projects: "projects",
  candidates: "a candidate profile",
  tasks: "tasks",
};

// Turn a Postgres FK violation into a message that names the blocking relation.
function fkMessage(error: PostgrestError): string {
  const src = `${error.details ?? ""} ${error.message ?? ""}`;
  const m = /table "([^"]+)"/.exec(src);
  const raw = m?.[1];
  const rel = raw ? REL_LABEL[raw] ?? raw.replace(/_/g, " ") : "other records";
  return `Can't permanently delete: still referenced by ${rel}. Archive it instead, or clear the ${rel} first.`;
}

export async function archiveRecord(
  table: ArchivableTable,
  id: string,
  actor: string | null,
): Promise<Result> {
  const { error } = await updateArchivable(table, id, { archived_at: new Date().toISOString(), archived_by: actor }).is(
    "archived_at",
    null,
  );
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table, recordId: id, operation: "archive", actor });
  return { ok: true };
}

export async function restoreRecord(
  table: ArchivableTable,
  id: string,
  actor: string | null,
): Promise<Result> {
  const { error } = await updateArchivable(table, id, { archived_at: null, archived_by: null });
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table, recordId: id, operation: "restore", actor });
  return { ok: true };
}

// Hard delete, guarded by the schema's own foreign keys. On a 23503 violation
// we surface which relation blocks it rather than a raw DB error. No PII is
// copied into the audit row; it records the erasure event and the actor only.
export async function guardedDelete(
  table: ArchivableTable,
  id: string,
  actor: string | null,
  context?: Record<string, unknown>,
): Promise<Result> {
  const { error } = await deleteArchivable(table, id);
  if (error) {
    if (error.code === "23503") return { ok: false, error: fkMessage(error) };
    return { ok: false, error: error.message };
  }
  await recordAudit({ table, recordId: id, operation: "delete", actor, context });
  return { ok: true };
}
