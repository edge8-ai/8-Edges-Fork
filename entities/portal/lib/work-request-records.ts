import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

// The two writes company-os makes to contractor work requests (A.70, ADR
// 0018): the admin opening a request for a contractor, and the monthly payment
// roll-up linking finished work to the payment it pays. Until A.70 the door
// handed out `insertContractorWorkRequests(row)` and
// `updateContractorWorkRequests(patch)`, and company-os chained its own select
// and filter onto them. Each command here is the exact write its caller made:
// same payload, filter and returned columns.
// entities/portal/lib/work-request-records.test.ts pins each one.

/** Opens a work request the admin has built, and resolves to its `{ data: { id, access_token }, error }`. */
export function openWorkRequestRow(row: TablesInsert<{ schema: "company_os" }, "contractor_work_requests">) {
  return companyOs.from("contractor_work_requests").insert(row).select("id, access_token").single();
}

/** Links these work requests to the contractor payment that pays them, stamping them updated now. Resolves to `{ error }`. */
export function linkWorkRequestsToPayment(requestIds: string[], paymentId: string) {
  return companyOs.from("contractor_work_requests").update({ payment_id: paymentId, updated_at: new Date().toISOString() }).in("id", requestIds);
}
