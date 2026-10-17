"use server";

import { revalidatePath } from "next/cache";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { closeChainForRequisition } from "@/entities/hiring/lib/chain/close";
import { chainMode } from "@/entities/hiring/lib/chain/run";

/** Whether a req opens without an approval: only while the hiring chain is in shadow. A switch that cannot be read keeps the approval. */
async function opensDirectly(): Promise<boolean> {
  try {
    return (await chainMode()) === "shadow";
  } catch {
    return false;
  }
}

// Matches the job_requisitions CHECK constraints.
const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "intern", "temp", "advisor"]);
const REMOTE_POLICIES = new Set(["onsite", "hybrid", "remote"]);
const CLOSE_OUTCOMES = new Set(["filled", "closed", "cancelled"]);

function refresh(id: string) {
  revalidatePath("/admin/talent/jobs");
  revalidatePath(`/admin/talent/jobs/${id}`);
  // status/is_public and posting content changes here can affect what's live
  // on /careers, so bust its cache too (belt-and-suspenders alongside the
  // noStore() in lib/jobs.ts).
  revalidatePath("/careers");
}

// ─── Create ──────────────────────────────────────────────────────────────────
// New reqs open immediately (that's why a recruiter adds one) but stay
// internal-only: is_public defaults false, so nothing leaks to /careers until
// the posting editor publishes it. Every req gets the standard 5-stage
// pipeline the rest of the ATS assumes.
const DEFAULT_STAGES = [
  { name: "Screen", stage_kind: "screen", position: 1, is_terminal: false },
  { name: "Interview", stage_kind: "interview", position: 2, is_terminal: false },
  { name: "Offer", stage_kind: "offer", position: 3, is_terminal: false },
  { name: "Hired", stage_kind: "hired", position: 4, is_terminal: true },
  { name: "Rejected", stage_kind: "rejected", position: 5, is_terminal: true },
];

export type NewJobReq = {
  title: string;
  employment_type: string;
  location?: string | null;
  remote_policy?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  description?: string | null;
};

export async function createJobReq(input: NewJobReq): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("hiring.ats");

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!EMPLOYMENT_TYPES.has(input.employment_type)) return { ok: false, error: "Unknown employment type." };
  if (input.remote_policy && !REMOTE_POLICIES.has(input.remote_policy)) return { ok: false, error: "Unknown remote policy." };
  if (input.salary_min != null && (!Number.isFinite(input.salary_min) || input.salary_min < 0))
    return { ok: false, error: "Salary min must be zero or more." };
  if (input.salary_max != null && (!Number.isFinite(input.salary_max) || input.salary_max < 0))
    return { ok: false, error: "Salary max must be zero or more." };
  if (input.salary_min != null && input.salary_max != null && input.salary_max < input.salary_min)
    return { ok: false, error: "Salary max must be at least salary min." };

  // Opening commits headcount and a band, so in a live hiring chain a new req
  // starts as a draft and opens on the approver's yes (Z.9, decision 1); in
  // shadow it opens at once, as before.
  const opens = await opensDirectly();
  const { data, error } = await companyOs.from("job_requisitions").insert({
      title,
      employment_type: input.employment_type,
      location: input.location?.trim() || null,
      remote_policy: input.remote_policy || null,
      salary_min_cents: input.salary_min == null ? null : Math.round(input.salary_min * 100),
      salary_max_cents: input.salary_max == null ? null : Math.round(input.salary_max * 100),
      currency: input.currency?.trim().toLowerCase() || "usd",
      description: input.description?.trim() || null,
      status: opens ? "open" : "draft",
      opened_at: opens ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create the req." };

  const { error: sErr } = await companyOs.from("application_stages").insert(DEFAULT_STAGES.map((s) => ({ ...s, job_requisition_id: data.id })));
  if (sErr) return { ok: false, error: `Req created, but its pipeline stages failed: ${sErr.message}` };

  await recordAudit({
    table: "job_requisitions",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { title, employment_type: input.employment_type, status: opens ? "open" : "draft" },
    context: { via: "jobs_new_req" },
  });
  refresh(data.id);
  return { ok: true, id: data.id };
}

// ─── Edit ────────────────────────────────────────────────────────────────────
// Core req fields from the list shelf. Salary arrives in dollars (the only
// place it converts to integer cents, mirroring updateDeal). Only keys present
// in the patch are written.
export type JobReqPatch = {
  title?: string;
  employment_type?: string;
  location?: string | null;
  remote_policy?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  description?: string | null;
  hiring_manager_id?: string | null;
};

export async function updateJobReq(jobReqId: string, patch: JobReqPatch): Promise<Result> {
  const { user: admin } = await requirePermission("hiring.ats");
  const updates: CompanyOsUpdate<"job_requisitions"> = {};

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty." };
    updates.title = t;
  }
  if (patch.employment_type !== undefined) {
    if (!EMPLOYMENT_TYPES.has(patch.employment_type)) return { ok: false, error: "Unknown employment type." };
    updates.employment_type = patch.employment_type;
  }
  if (patch.location !== undefined) updates.location = patch.location?.trim() || null;
  if (patch.remote_policy !== undefined) {
    if (patch.remote_policy === null || patch.remote_policy === "") updates.remote_policy = null;
    else if (!REMOTE_POLICIES.has(patch.remote_policy)) return { ok: false, error: "Unknown remote policy." };
    else updates.remote_policy = patch.remote_policy;
  }
  if (patch.salary_min !== undefined) {
    if (patch.salary_min !== null && (!Number.isFinite(patch.salary_min) || patch.salary_min < 0))
      return { ok: false, error: "Salary min must be zero or more." };
    updates.salary_min_cents = patch.salary_min === null ? null : Math.round(patch.salary_min * 100);
  }
  if (patch.salary_max !== undefined) {
    if (patch.salary_max !== null && (!Number.isFinite(patch.salary_max) || patch.salary_max < 0))
      return { ok: false, error: "Salary max must be zero or more." };
    updates.salary_max_cents = patch.salary_max === null ? null : Math.round(patch.salary_max * 100);
  }
  if (
    updates.salary_min_cents != null &&
    updates.salary_max_cents != null &&
    (updates.salary_max_cents as number) < (updates.salary_min_cents as number)
  ) {
    return { ok: false, error: "Salary max must be at least salary min." };
  }
  if (patch.currency !== undefined) {
    const c = patch.currency.trim().toLowerCase();
    if (!c) return { ok: false, error: "Currency is required." };
    updates.currency = c;
  }
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  // hiring_manager_id points at people, not team_members — the person owns the
  // req even if their seat or manager changes.
  if (patch.hiring_manager_id !== undefined) updates.hiring_manager_id = patch.hiring_manager_id || null;

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("job_requisitions").update(updates).eq("id", jobReqId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "job_requisitions",
    recordId: jobReqId,
    operation: "update",
    actor: admin.email,
    newData: updates,
  });
  refresh(jobReqId);
  return { ok: true };
}

// ─── Close / reopen ──────────────────────────────────────────────────────────
// Closing takes an outcome (filled, closed, cancelled) and stamps closed_at.
// A non-open req drops off /careers automatically (the public listing requires
// status='open'), so is_public is left as the recruiter set it.
export async function closeJobReq(jobReqId: string, outcome: string): Promise<Result> {
  const access = await requirePermission("hiring.ats");
  const admin = access.user;
  if (!CLOSE_OUTCOMES.has(outcome)) return { ok: false, error: "Pick an outcome (filled, closed, or cancelled)." };

  const updates = { status: outcome, closed_at: new Date().toISOString() };
  const { error } = await companyOs.from("job_requisitions").update(updates).eq("id", jobReqId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "job_requisitions",
    recordId: jobReqId,
    operation: "update",
    actor: admin.email,
    newData: updates,
  });
  // The requisition's hiring chain ends, and every approval pending under it
  // is withdrawn (Z.9, spec section 3a).
  await closeChainForRequisition(jobReqId, { personId: access.personId, email: admin.email ?? "unknown" });
  refresh(jobReqId);
  return { ok: true };
}

export async function reopenJobReq(jobReqId: string): Promise<Result> {
  const { user: admin } = await requirePermission("hiring.ats");
  // In a live hiring chain a reopened req is a draft again and opens on the
  // approver's yes, as a new one does (Z.9); in shadow it opens at once.
  const opens = await opensDirectly();
  const updates = opens
    ? { status: "open", closed_at: null, opened_at: new Date().toISOString(), chain_step: null }
    : { status: "draft", closed_at: null, chain_step: null };
  const { error } = await companyOs.from("job_requisitions").update(updates).eq("id", jobReqId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "job_requisitions",
    recordId: jobReqId,
    operation: "update",
    actor: admin.email,
    newData: updates,
  });
  refresh(jobReqId);
  return { ok: true };
}

// ─── Delete ──────────────────────────────────────────────────────────────────
// Permanent. Blocked while applications reference the req — close it instead;
// applicant history is part of the hiring record. An empty req's stages are
// removed first (they FK the req).
export async function deleteJobReq(jobReqId: string): Promise<Result> {
  const { user: admin } = await requirePermission("hiring.ats");

  const { count, error: cErr } = await companyOs.from("applications").select("id", { count: "exact", head: true })
    .eq("job_requisition_id", jobReqId);
  if (cErr) return { ok: false, error: cErr.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `This req has ${count} application${count === 1 ? "" : "s"} — close it instead of deleting, so the hiring history stays intact.`,
    };
  }

  const { error: sErr } = await companyOs.from("application_stages").delete().eq("job_requisition_id", jobReqId);
  if (sErr) return { ok: false, error: sErr.message };

  const { error } = await companyOs.from("job_requisitions").delete().eq("id", jobReqId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "job_requisitions",
    recordId: jobReqId,
    operation: "delete",
    actor: admin.email,
    context: { via: "jobs_shelf" },
  });
  revalidatePath("/admin/talent/jobs");
  revalidatePath("/careers");
  return { ok: true };
}
