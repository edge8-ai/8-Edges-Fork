import { requirePermission } from "@/kernel/identity/access-request";
import { actorLabel } from "@/entities/reimbursements/lib/deciders";
import { runSpreadsheetResponse } from "@/entities/reimbursements/lib/payer-run";

// The run's spreadsheet (plan section 8, design §1.11), behind
// reimbursements.pay. Both surfaces serve it from their own path through the
// same handler in lib/payer-run.ts.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("reimbursements.pay");
  const { id } = await props.params;
  return runSpreadsheetResponse(id, actorLabel(access));
}
