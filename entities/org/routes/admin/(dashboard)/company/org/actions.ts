"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { updateTeamMembers } from "@/kernel/identity/writes";
import { type Result } from "@/entities/crm";
import { reportingLineRefusal } from "@/entities/org/lib/reporting-lines";

// The org chart's edit mode: change who one person reports to. It asks for
// org.people, the atom that guards the Talent record holding the same field,
// so the chart offers no more than Talent already does. Undo is this same
// action called with the previous manager.
const Input = z.object({
  teamMemberId: z.string().uuid(),
  managerId: z.string().uuid().nullable(),
});

export async function setReportingLine(teamMemberId: string, managerId: string | null): Promise<Result> {
  const { user: admin } = await requirePermission("org.people");
  const parsed = Input.safeParse({ teamMemberId, managerId });
  if (!parsed.success) return { ok: false, error: "That isn't a person on the chart." };

  const refusal = await reportingLineRefusal(parsed.data.teamMemberId, parsed.data.managerId);
  if (refusal) return { ok: false, error: refusal };

  // Select the row back so an id that matches nothing (a record removed in
  // another tab) is reported, not passed off as saved.
  const { data, error } = await updateTeamMembers({ manager_id: parsed.data.managerId })
    .eq("id", parsed.data.teamMemberId)
    .select("id");
  if (error) {
    console.error("[org/chart] team_members update failed:", error.message);
    return { ok: false, error: "Could not save the reporting line. Please try again." };
  }
  if (!data?.length) return { ok: false, error: "That person is no longer on the chart. Reload the page." };

  await recordAudit({
    table: "team_members",
    recordId: parsed.data.teamMemberId,
    operation: "update",
    actor: admin.email,
    newData: { manager_id: parsed.data.managerId },
  });
  revalidatePath("/admin/company/org");
  revalidatePath("/team/org");
  revalidatePath("/admin/talent/team");
  revalidatePath(`/admin/talent/team/${parsed.data.teamMemberId}`);
  return { ok: true };
}
