"use server";
// Log a deal follow-up (AH.5): Admin Home's Logged and Snooze on a deal whose
// next step is due. It writes only the next step and its date, which is all a
// follow-up changes, with the same permission, audit row and refresh as the
// deal page's own edit (updateDeal), so a deal reads the same whichever page
// moved it.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import type { Result } from "@/kernel/data/result";

const Input = z.object({
  dealId: z.string().min(1),
  nextStep: z.string().max(500).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
});

/** Set a deal's next step and when it is due: a follow-up logged (a new step), or snoozed (the same step, a later date). */
export async function logFollowUp(dealId: string, nextStep: string | null, date: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const parsed = Input.safeParse({ dealId, nextStep, date });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the follow-up." };
  const updates = { next_step: parsed.data.nextStep?.trim() || null, next_step_date: parsed.data.date };
  const { error } = await companyOs.from("deals").update(updates).eq("id", parsed.data.dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "deals", recordId: parsed.data.dealId, operation: "update", actor: admin.email, newData: updates, context: { from: "follow-up" } });
  revalidateSurfaces("/revenue/deals");
  revalidatePath("/admin");
  return { ok: true };
}
