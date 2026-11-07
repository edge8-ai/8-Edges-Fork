"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { generateIdeaPlan } from "@/entities/ideas/lib/ai/idea-plan";
import { IDEA_STATUSES, type IdeaStatus } from "@/entities/ideas/lib/ideas";
import type { Result } from "@/kernel/data/result";

function refresh() {
  revalidatePath("/admin/innovation/ideas");
}

export async function updateIdeaStatus(id: string, status: string): Promise<Result> {
  const { user: admin } = await requirePermission("ideas.manage");
  if (!(IDEA_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Invalid status." };
  }

  const { error } = await companyOs.from("ideas").update({ status: status as IdeaStatus, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "ideas", recordId: id, operation: "update", actor: admin.email, newData: { status } });
  refresh();
  return { ok: true };
}

// Re-run Claude plan generation for an idea whose generation failed (or whose
// plan an admin wants regenerated after a model change).
export async function retryIdeaPlan(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("ideas.manage");

  const r = await generateIdeaPlan(id);
  if (!r.ok) return { ok: false, error: r.error };

  await recordAudit({ table: "ideas", recordId: id, operation: "update", actor: admin.email, newData: { ai_plan: "regenerated" } });
  refresh();
  return { ok: true };
}
