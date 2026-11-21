import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { insertTimeOff } from "./writes";

// The employee's own leave filing. Until A.88.6 team's own-service funnel made
// this write through fileLeaveRow (A.70, ADR 0018); now time-off's own /team
// action files it through fileOwnLeave below, which keeps the funnel's rule.
// scripts/leave-status-writers.test.mjs lists this file and every caller of
// fileLeaveRow, because a leave row is born here with whatever status it carries.

/**
 * Files a leave request row the caller has already built and scoped, and
 * resolves to the new row's `{ data: { id }, error }`. fileOwnLeave below is
 * the one caller that files for an employee.
 */
export function fileLeaveRow(row: TablesInsert<{ schema: "company_os" }, "time_off">) {
  return insertTimeOff(row).select("id").maybeSingle();
}

/**
 * Files the actor's OWN leave request (A.88.6, the rule team's teamInsertOwn
 * applied): team_member_id is always the actor's own, never the manager scope
 * and never a value the row carries, which is overwritten rather than trusted.
 * Resolves to PostgREST's `{ data: { id }, error }`, which createLeave reads.
 */
export function fileOwnLeave(
  actor: Pick<TeamActor, "teamMemberId">,
  row: Omit<TablesInsert<{ schema: "company_os" }, "time_off">, "team_member_id"> & { team_member_id?: unknown },
) {
  return fileLeaveRow({ ...row, team_member_id: actor.teamMemberId });
}
