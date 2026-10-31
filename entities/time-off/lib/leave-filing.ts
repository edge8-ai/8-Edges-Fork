import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import { insertTimeOff } from "./writes";

// The one leave write another entity makes (A.70, ADR 0018): team's
// own-service insert for /team, which until A.70 called the door's raw
// `insertTimeOff(row)` and chained `.select("id").maybeSingle()` itself.
// scripts/leave-status-writers.test.mjs lists this file and every caller of
// fileLeaveRow, because a leave row is born here with whatever status it carries.

/**
 * Files a leave request row the caller has already built and scoped, and
 * resolves to the new row's `{ data: { id }, error }` (the /team own-service
 * insert, which forces the row to the actor's own team member id before this).
 * The employee's submit hands this to createLeave, which records the rest.
 */
export function fileLeaveRow(row: TablesInsert<{ schema: "company_os" }, "time_off">) {
  return insertTimeOff(row).select("id").maybeSingle();
}
