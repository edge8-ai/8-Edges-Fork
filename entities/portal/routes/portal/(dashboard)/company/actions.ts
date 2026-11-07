"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { updateCompanyProfile, type CompanyProfile } from "@/entities/portal/lib/profile";

// The company id arrives from the client, so updateCompanyProfile re-checks the
// actor holds the admin role for THAT company before writing anything.
export async function saveCompanyProfile(
  companyId: string,
  input: CompanyProfile,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requirePortalPermission("surface.portal");
  const res = await updateCompanyProfile(actor, companyId, input);
  if (res.ok) {
    revalidatePath("/portal/company");
    revalidatePath("/portal");
  }
  return res;
}
