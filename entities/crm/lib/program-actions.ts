"use server";

import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { updateAiPrograms } from "@/entities/client-programs";
import type { Result } from "@/kernel/data/result";

// The statuses an admin sets by hand. Archiving hides the program from every
// hub band and from the portal (the loaders exclude archived rows); marking
// complete keeps it listed with a Complete badge. "draft" is the portal's
// own state while a client builds a plan, so it is not offered here.
export type AdminProgramStatus = "active" | "complete" | "archived";
const STATUSES: AdminProgramStatus[] = ["active", "complete", "archived"];

export async function setProgramStatus(
  companyId: string,
  programId: string,
  status: AdminProgramStatus,
): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };
  // ai_programs belongs to the portal entity; the update goes through its writer.
  const { error } = await updateAiPrograms({ status }).eq("id", programId).eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "ai_programs",
    recordId: programId,
    operation: "update",
    actor: admin.email,
    newData: { status },
  });
  revalidateSurfaces(`/revenue/companies/${companyId}`);
  revalidateSurfaces(`/revenue/companies/${companyId}/programs/${programId}`);
  revalidatePath("/portal/hub");
  return { ok: true };
}
