"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { selectStaffAssignments, insertStaffAssignments, updateStaffAssignments } from "@/entities/contacts";
import { selectPersonCompanies } from "@/entities/contacts";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { saigonToday } from "@/kernel/config/dates";

// Server actions for company_os.staff_assignments, used from both the company
// 360 "Assigned staff" card and the team-member detail "Assignments" block.

function refresh(companyId: string, teamMemberId: string) {
  revalidatePath(`/admin/revenue/companies/${companyId}`);
  revalidatePath(`/admin/talent/team/${teamMemberId}`);
}

export async function createAssignment(input: {
  companyId: string;
  teamMemberId: string;
  roleTitle: string;
  clientVisible?: boolean;
}): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");
  if (!input.companyId || !input.teamMemberId) {
    return { ok: false, error: "Pick both a company and a team member." };
  }

  const { data: existing, error: existingErr } = await selectStaffAssignments("id")
    .eq("company_id", input.companyId)
    .eq("team_member_id", input.teamMemberId)
    .eq("status", "active")
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existing) return { ok: false, error: "This person is already assigned to this company." };

  const { data: row, error } = await insertStaffAssignments({
      company_id: input.companyId,
      team_member_id: input.teamMemberId,
      role_title: input.roleTitle.trim() || null,
      client_visible: input.clientVisible ?? true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: row.id as string,
    operation: "insert",
    actor: admin.email,
    context: { company_id: input.companyId, team_member_id: input.teamMemberId },
  });

  refresh(input.companyId, input.teamMemberId);
  return { ok: true };
}

// Toggle whether an active assignment appears on the client's portal team
// roster. Does not affect the team member's internal access (e.g. the client
// roadmap in /team), which follows the assignment itself.
export async function setAssignmentVisibility(id: string, clientVisible: boolean): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");

  const { data: row, error: rErr } = await selectStaffAssignments("company_id, team_member_id")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };

  const { error } = await updateStaffAssignments({ client_visible: clientVisible })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "set_client_visible", client_visible: clientVisible },
  });

  refresh(row.company_id as string, row.team_member_id as string);
  return { ok: true };
}

// Names (or clears) the person at the client who approves this placement's
// leave. Approval power follows this field, not the portal role, so it is an
// admin-only write and every change is audited. Clearing it hands approval
// back to the Edge8 manager (lib/time-off/approver.ts).
export async function setAssignmentClientManager(
  id: string,
  clientManagerPersonId: string | null,
): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");

  const { data: row, error: rErr } = await selectStaffAssignments("company_id, team_member_id")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };

  // The named person must actually be a contact at THIS client — otherwise a
  // mistyped id could hand a stranger the reason text and the decision.
  if (clientManagerPersonId) {
    const { data: link, error: linkErr } = await selectPersonCompanies("person_id")
      .eq("company_id", row.company_id as string)
      .eq("person_id", clientManagerPersonId)
      .maybeSingle();
    if (linkErr) return { ok: false, error: linkErr.message };
    if (!link) return { ok: false, error: "That person is not a contact at this client." };
  }

  const { error } = await updateStaffAssignments({ client_manager_person_id: clientManagerPersonId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "set_client_manager", client_manager_person_id: clientManagerPersonId },
  });

  refresh(row.company_id as string, row.team_member_id as string);
  return { ok: true };
}

// Ends an assignment (status -> 'ended'); the row stays for history rather than
// being deleted. Re-assigning the same pair inserts a fresh active row.
export async function endAssignment(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");

  const { data: row, error: rErr } = await selectStaffAssignments("company_id, team_member_id, status")
    .eq("id", id)
    .maybeSingle();
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };
  if (row.status !== "active") return { ok: true };

  const { error } = await updateStaffAssignments({ status: "ended", end_date: saigonToday() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "end_assignment" },
  });

  refresh(row.company_id as string, row.team_member_id as string);
  return { ok: true };
}
