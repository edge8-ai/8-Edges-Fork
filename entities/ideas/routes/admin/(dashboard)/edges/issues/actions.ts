"use server";

import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { type Result } from "@/kernel/data/result";
import { ISSUE_DIAGNOSES, ISSUE_STATUSES } from "@/entities/org";

function refresh() {
  revalidatePath("/admin/edges/issues");
  revalidatePath("/admin/company/goals");
}

export async function createIssue(input: {
  title: string;
  diagnosis: string;
  assignee_person_id: string;
  key_result_id?: string;
  notes_md?: string;
}): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("ideas.manage");
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Say what the issue is." };
  if (!ISSUE_DIAGNOSES.includes(input.diagnosis as (typeof ISSUE_DIAGNOSES)[number])) {
    return { ok: false, error: "Diagnose it first: goal problem, system problem, or execution problem." };
  }
  if (!input.assignee_person_id) return { ok: false, error: "Assign it to a person." };

  const row = {
    title,
    diagnosis: input.diagnosis,
    assignee_person_id: input.assignee_person_id,
    key_result_id: input.key_result_id || null,
    notes_md: input.notes_md?.trim() || null,
    filed_by: admin.email,
  };
  const { data, error } = await companyOs.from("issues").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: data.id, operation: "insert", actor: admin.email, newData: row });
  refresh();
  return { ok: true, id: data.id };
}

export async function setIssueStatus(id: string, status: string): Promise<Result> {
  const { user: admin } = await requirePermission("ideas.manage");
  if (!ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
    return { ok: false, error: "Invalid status." };
  }
  const updates: CompanyOsUpdate<"issues"> = { status };
  updates.resolved_at = status === "solved" || status === "dropped" ? new Date().toISOString() : null;

  const { error } = await companyOs.from("issues").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

export async function setIssueAssignee(id: string, personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("ideas.manage");
  if (!personId) return { ok: false, error: "Assign it to a person." };
  // The picker only offers team members, but the action is the boundary: an
  // id that is not an active team member's person is refused here, not stored.
  const { data: member, error: memberErr } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .eq("status", "active")
    .maybeSingle();
  if (memberErr) return { ok: false, error: memberErr.message };
  if (!member) return { ok: false, error: "That person is not an active team member." };
  const updates = { assignee_person_id: personId };
  const { error } = await companyOs.from("issues").update(updates).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "issues", recordId: id, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}
