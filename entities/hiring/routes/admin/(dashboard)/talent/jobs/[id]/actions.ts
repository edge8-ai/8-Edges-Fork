"use server";

import { revalidatePath } from "next/cache";
import { cancelScheduledInterviews } from "@/entities/hiring/lib/interviews-writes";
import { companyOs, type CompanyOsUpdate, type Json } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { logStageMove } from "@/entities/hiring/lib/ats/stage-log";
import { screenApplication } from "@/entities/hiring/lib/resume-screen";
import { directDecisionRefusal } from "@/entities/hiring/lib/chain/direct-decision";
import { closeChainForDecided } from "@/entities/hiring/lib/chain/close";
import {
  addLoopStep,
  deleteLoopStep,
  moveLoopStep,
  setStepInterviewers,
  updateLoopStep,
} from "@/entities/hiring/lib/ats/loop";
import type { Result } from "@/kernel/data/result";

// Move an application to a hiring stage on its job req's board. Landing on a
// terminal stage stamps decided_at; the recruiter still sets final status.
export async function moveApplicationStage(
  applicationId: string,
  toStageId: string,
  jobReqId: string,
): Promise<Result> {
  const { user, personId } = await requirePermission("hiring.ats");

  const { data: stage, error: stageErr } = await companyOs.from("application_stages").select("is_terminal")
    .eq("id", toStageId)
    .maybeSingle();
  if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? "Unknown stage." };
  // A hired or rejected stage is a decision; in a live hiring chain it is proposed (Z.9).
  if (stage.is_terminal) {
    const refused = await directDecisionRefusal(applicationId);
    if (refused) return { ok: false, error: refused };
  }

  const { data: cur, error: curErr } = await companyOs.from("applications").select("current_stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (curErr) return { ok: false, error: curErr.message };
  const fromStageId = (cur?.current_stage_id as string | null) ?? null;

  // A decision is a fact about a terminal stage. Moving into one stamps it;
  // moving back out clears it, or a candidate reconsidered after a rejection
  // reads as both "in interview" and "decided N days ago" (hiring sweep).
  const patch: CompanyOsUpdate<"applications"> = {
    current_stage_id: toStageId,
    decided_at: stage.is_terminal ? new Date().toISOString() : null,
  };

  const { error } = await companyOs.from("applications").update(patch).eq("id", applicationId);
  if (error) return { ok: false, error: error.message };
  await logStageMove(applicationId, fromStageId, toStageId);

  // A terminal stage is a decision made by hand: the hiring chain run ends (Z.9).
  if (stage.is_terminal) await closeChainForDecided(applicationId, "a final stage", { personId: personId ?? null, email: user.email ?? "unknown" });
  // A terminal stage is a decision; the interviews still scheduled are
  // cancelled with it (C.23). Reported, never fatal: the move has persisted.
  if (stage.is_terminal) {
    const cancelled = await cancelScheduledInterviews(applicationId);
    if (!cancelled.ok) {
      revalidatePath(`/admin/talent/jobs/${jobReqId}`);
      return { ok: false, error: `Moved, but the scheduled interviews could not be cancelled: ${cancelled.error}` };
    }
  }

  revalidatePath(`/admin/talent/jobs/${jobReqId}`);
  return { ok: true };
}

// ─── AI resume screen ────────────────────────────────────────────────────────

// Run (or re-run) the AI screen for one application. Synchronous by design —
// the admin clicked a button and wants the result on refresh.
export async function rescanApplication(applicationId: string, jobReqId: string): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await screenApplication(applicationId);
  revalidatePath(`/admin/talent/jobs/${jobReqId}`);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// Backfill: screen every application on this req that has never been scanned
// or previously failed. Runs 3 at a time to stay inside the function window.
export async function scanUnscannedApplications(
  jobReqId: string,
): Promise<{ ok: true; scanned: number; failed: number } | { ok: false; error: string }> {
  await requirePermission("hiring.ats");

  const { data, error } = await companyOs.from("applications").select("id")
    .eq("job_requisition_id", jobReqId)
    .or("ai_screen_status.is.null,ai_screen_status.eq.failed");
  if (error) return { ok: false, error: error.message };

  const ids = (data ?? []).map((r) => r.id as string);
  let scanned = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += 3) {
    const results = await Promise.all(ids.slice(i, i + 3).map((id) => screenApplication(id)));
    for (const r of results) r.ok ? scanned++ : failed++;
  }

  revalidatePath(`/admin/talent/jobs/${jobReqId}`);
  return { ok: true, scanned, failed };
}

// ─── Public posting ──────────────────────────────────────────────────────────
// A req is live on /careers iff status='open' AND is_public. Everything the
// public page renders is managed here: slug (public URL), full_jd (markdown
// body), excerpt/department/featured (metadata), and up to 3 screening
// questions snapshotted onto each application at apply time.
export type JobPostingPatch = {
  is_public?: boolean;
  slug?: string;
  full_jd?: string | null;
  excerpt?: string | null;
  department?: string | null;
  featured?: boolean;
  questions?: string[];
};

export async function updateJobPosting(jobReqId: string, patch: JobPostingPatch): Promise<Result> {
  const { user: admin } = await requirePermission("hiring.ats");
  const updates: CompanyOsUpdate<"job_requisitions"> = {};

  if (patch.is_public !== undefined) updates.is_public = patch.is_public;
  if (patch.slug !== undefined) {
    const slug = patch.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) return { ok: false, error: "Slug can't be empty." };
    updates.slug = slug;
  }
  if (patch.full_jd !== undefined) updates.full_jd = patch.full_jd?.trim() || null;
  if (patch.questions !== undefined) {
    const qs = patch.questions.map((q) => q.trim()).filter(Boolean).slice(0, 3);
    updates.application_questions = qs;
  }

  // Presentation extras ride in metadata; merge without clobbering other keys.
  if (patch.excerpt !== undefined || patch.department !== undefined || patch.featured !== undefined) {
    const { data: cur, error: curErr } = await companyOs.from("job_requisitions").select("metadata")
      .eq("id", jobReqId)
      .maybeSingle();
    if (curErr || !cur) return { ok: false, error: curErr?.message ?? "Req not found." };
    const meta = { ...((cur.metadata as Record<string, unknown>) ?? {}) };
    if (patch.excerpt !== undefined) meta.excerpt = patch.excerpt?.trim() || null;
    if (patch.department !== undefined) meta.department = patch.department?.trim() || null;
    if (patch.featured !== undefined) meta.featured = patch.featured;
    // jsonb column, rebuilt above as an open record.
    updates.metadata = meta as Json;
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("job_requisitions").update(updates).eq("id", jobReqId);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That slug is already used by another req." };
    return { ok: false, error: error.message };
  }
  await recordAudit({
    table: "job_requisitions",
    recordId: jobReqId,
    operation: "update",
    actor: admin.email,
    newData: updates,
  });
  revalidatePath(`/admin/talent/jobs/${jobReqId}`);
  revalidatePath("/careers");
  return { ok: true };
}

// ---- interview loop ---------------------------------------------------------
// The loop is defined on the requisition and inherited by every candidate who
// reaches the Interview stage. Admin-only writes; /team/hiring only reads.

const refreshReq = (reqId: string) => revalidatePath(`/admin/talent/jobs/${reqId}`);

export async function addInterviewStep(
  reqId: string,
  name: string,
  durationMinutes: number | null,
  interviewerIds: string[],
): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await addLoopStep(reqId, { name, durationMinutes, interviewerIds });
  if (res.ok) refreshReq(reqId);
  return res;
}

export async function updateInterviewStep(
  reqId: string,
  stepId: string,
  name: string,
  durationMinutes: number | null,
): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await updateLoopStep(stepId, { name, durationMinutes });
  if (res.ok) refreshReq(reqId);
  return res;
}

export async function setInterviewStepInterviewers(
  reqId: string,
  stepId: string,
  personIds: string[],
): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await setStepInterviewers(stepId, personIds);
  if (res.ok) refreshReq(reqId);
  return res;
}

export async function removeInterviewStep(reqId: string, stepId: string): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await deleteLoopStep(stepId);
  if (res.ok) refreshReq(reqId);
  return res;
}

export async function moveInterviewStep(
  reqId: string,
  stepId: string,
  direction: "up" | "down",
): Promise<Result> {
  await requirePermission("hiring.ats");
  const res = await moveLoopStep(stepId, direction);
  if (res.ok) refreshReq(reqId);
  return res;
}
