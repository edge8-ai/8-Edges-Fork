// The own-service write paths for /team, one branch per table so the
// table-ownership gate (scripts/check-table-ownership.mjs) sees every name:
// ideas, equipment_requests, time_off and onboarding_tasks belong to other
// entities, so those go through their owners' writers. time_off is inserted
// from here but never updated: a leave request's status moves only through
// time-off's own step, which guards the write on the status it read (A.30);
// the rest are this entity's own. A table missing here cannot be written from
// /team, which is the point — reads are allowlisted in data.ts and writes are
// allowlisted here. Split out of data.ts by the 2026-09-05 bug-hunt fixes,
// which found the old `.from(table)` writes invisible to the gate.
import { fileEquipmentRequest, type EquipmentRequestInput } from "@/entities/org";
import { editIdea } from "@/entities/ideas";
import { fileLeaveRow } from "@/entities/time-off";
import { editOnboardingTask } from "@/entities/onboarding";

/** The tables /team may read through data.ts; the write switches below cover a subset. */
export type ScopedTable = "time_off" | "ideas" | "onboarding_plans" | "onboarding_tasks" | "equipment" | "equipment_requests";

type Row = Record<string, unknown>;

// Inserts the row and reads back its id: org's equipment command (A.67) and
// time-off's leave command (A.70) each do both themselves, so every branch
// resolves to the new row's `{ data: { id }, error }`.
export function insertOwn(table: ScopedTable, row: Row) {
  switch (table) {
    // A new spark is not inserted here: teamInsertOwn hands it to Ideas'
    // postSpark, the one writer every spark passes through (LD.2).
    case "equipment_requests":
      return fileEquipmentRequest(row as EquipmentRequestInput);
    // time-off's one insert command (A.70), which selects the id itself.
    case "time_off":
      return fileLeaveRow(row as Parameters<typeof fileLeaveRow>[0]);
    default:
      throw new Error(`teamInsertOwn: '${table}' has no insert path from /team`);
  }
}

// Takes the row id and filters on it here, so the builder it returns is never
// an unfiltered write (scripts/entity-writers-filtered.test.mjs).
export function updateInScope(table: ScopedTable, id: string, patch: Row) {
  switch (table) {
    case "ideas":
      return editIdea(id, patch as Parameters<typeof editIdea>[1]);
    case "onboarding_tasks":
      return editOnboardingTask(id, patch as Parameters<typeof editOnboardingTask>[1]);
    default:
      throw new Error(`teamUpdateInScope: '${table}' has no update path from /team`);
  }
}
