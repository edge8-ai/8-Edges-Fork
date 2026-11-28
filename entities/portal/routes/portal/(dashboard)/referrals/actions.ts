"use server";

import { revalidatePath } from "next/cache";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { chooseRedemptionForActor } from "@/entities/portal/lib/referrals";

// Client-portal action: an affiliate chooses how to take one of their own
// commissions. requirePortalPermission() gates identity; chooseRedemptionForActor
// re-checks ownership against the actor's codes before writing (no trust in the
// client-supplied id).
export async function chooseRedemption(
  commissionId: string,
  choice: "work_credit" | "cash",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requirePortalPermission("surface.portal");
  const r = await chooseRedemptionForActor(actor, commissionId, choice);
  if (r.ok) revalidatePath("/portal/referrals");
  return r;
}
