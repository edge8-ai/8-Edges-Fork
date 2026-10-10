"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { updateLeavePolicies } from "@/entities/time-off";
import type { Result } from "@/kernel/data/result";

// Flip a leave policy between auto-approved and manual. This is the only write
// on the list page; the rules and the text are edited on the policy's own page.
export async function setPolicyAutoApprove(id: string, autoApprove: boolean): Promise<Result> {
  await requirePermission("time-off.manage");
  if (!id) return { ok: false, error: "Missing policy." };

  const { error } = await updateLeavePolicies({ auto_approve: autoApprove })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/operations/time-off/policies");
  revalidatePath("/admin/operations/time-off/requests");
  return { ok: true };
}
