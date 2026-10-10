import { requirePermission } from "@/kernel/identity/access-request";
import { redirect } from "next/navigation";

// Time Off is split into Requests (approve/track leave) and History (policies,
// schedules, balances). The section index lands on Requests.
export default async function TimeOffIndexPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("time-off.manage");
  redirect("/admin/operations/time-off/requests");
}
