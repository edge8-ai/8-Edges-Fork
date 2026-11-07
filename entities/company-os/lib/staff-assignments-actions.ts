"use server";

import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import {
  contactLinkAt,
  createStaffAssignment,
  endPlacement,
  existingActivePlacement,
  setPlacementClientManager,
  setPlacementClientVisible,
  staffAssignment,
} from "@/entities/contacts";
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

  const { data: existing, error: existingErr } = await existingActivePlacement(input.companyId, input.teamMemberId);
  if (existingErr) return { ok: false, error: existingErr.message };
  if (existing) return { ok: false, error: "This person is already assigned to this company." };

  const { data: row, error } = await createStaffAssignment({
    companyId: input.companyId,
    teamMemberId: input.teamMemberId,
    roleTitle: input.roleTitle.trim() || null,
    clientVisible: input.clientVisible ?? true,
  });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: row.id,
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

  const { data: row, error: rErr } = await staffAssignment(id);
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };

  const { error } = await setPlacementClientVisible(id, clientVisible);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "set_client_visible", client_visible: clientVisible },
  });

  refresh(row.company_id, row.team_member_id);
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

  const { data: row, error: rErr } = await staffAssignment(id);
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };

  // The named person must actually be a contact at THIS client — otherwise a
  // mistyped id could hand a stranger the reason text and the decision.
  if (clientManagerPersonId) {
    const { data: link, error: linkErr } = await contactLinkAt(row.company_id, clientManagerPersonId);
    if (linkErr) return { ok: false, error: linkErr.message };
    if (!link) return { ok: false, error: "That person is not a contact at this client." };
  }

  const { error } = await setPlacementClientManager(id, clientManagerPersonId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "set_client_manager", client_manager_person_id: clientManagerPersonId },
  });

  refresh(row.company_id, row.team_member_id);
  return { ok: true };
}

// Ends an assignment (status -> 'ended'); the row stays for history rather than
// being deleted. Re-assigning the same pair inserts a fresh active row.
export async function endAssignment(id: string): Promise<Result> {
  const { user: admin } = await requirePermission("company-os.operations");

  const { data: row, error: rErr } = await staffAssignment(id);
  if (rErr || !row) return { ok: false, error: rErr?.message ?? "Assignment not found." };
  if (row.status !== "active") return { ok: true };

  const { error } = await endPlacement(id, saigonToday());
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "staff_assignments",
    recordId: id,
    operation: "update",
    actor: admin.email,
    context: { action: "end_assignment" },
  });

  refresh(row.company_id, row.team_member_id);
  return { ok: true };
}
