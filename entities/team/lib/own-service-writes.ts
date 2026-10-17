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
import { companyOs } from "@/kernel/data/supabase";
import { insertEquipmentRequests } from "@/entities/org";
import { insertIdeas, updateIdeas } from "@/entities/ideas";
import { insertTimeOff } from "@/entities/time-off";
import { updateOnboardingTasks } from "@/entities/onboarding";

/** The tables /team may read through data.ts; the write switches below cover a subset. */
export type ScopedTable = "time_off" | "ideas" | "onboarding_plans" | "onboarding_tasks" | "equipment" | "equipment_requests";

type Row = Record<string, unknown>;

export function insertOwn(table: ScopedTable, row: Row) {
  switch (table) {
    case "ideas":
      return insertIdeas(row as Parameters<typeof insertIdeas>[0]);
    case "equipment_requests":
      return insertEquipmentRequests(row as Parameters<typeof insertEquipmentRequests>[0]);
    case "time_off":
      return insertTimeOff(row as Parameters<typeof insertTimeOff>[0]);
    default:
      throw new Error(`teamInsertOwn: '${table}' has no insert path from /team`);
  }
}

// Takes the row id and filters on it here, so the builder it returns is never
// an unfiltered write (scripts/entity-writers-filtered.test.mjs).
export function updateInScope(table: ScopedTable, id: string, patch: Row) {
  switch (table) {
    case "ideas":
      return updateIdeas(patch as Parameters<typeof updateIdeas>[0]).eq("id", id);
    case "onboarding_tasks":
      return updateOnboardingTasks(patch as Parameters<typeof updateOnboardingTasks>[0]).eq("id", id);
    default:
      throw new Error(`teamUpdateInScope: '${table}' has no update path from /team`);
  }
}
