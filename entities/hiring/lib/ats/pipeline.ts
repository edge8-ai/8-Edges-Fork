// Application pipeline moves for the manager verbs on /team: advance, reject,
// and flag "please book this". Kept in lib/ats so admin can adopt the same
// write later; today admin drives stage changes through its own patch-based
// updateApplication (talent/applications/actions.ts). Callers own authorization
// and cache revalidation. Terminal-stage moves stamp decided_at, mirroring that
// admin stage write.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";

export type { Result };

type StageRow = { id: string; name: string; position: number; is_terminal: boolean };

async function reqStages(reqId: string): Promise<StageRow[]> {
  const { data, error: stagesErr } = await companyOs.from("application_stages").select("id, name, position, is_terminal")
    .eq("job_requisition_id", reqId)
    .order("position");
  if (stagesErr) console.error("[company-os/hiring] application_stages", stagesErr);
  return (data ?? []) as StageRow[];
}

async function loadApp(
  applicationId: string,
): Promise<{ id: string; reqId: string; currentStageId: string | null } | null> {
  const { data, error: appErr } = await companyOs.from("applications").select("id, job_requisition_id, current_stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) console.error("[company-os/hiring] applications", appErr);
  if (!data) return null;
  return {
    id: data.id as string,
    reqId: data.job_requisition_id as string,
    currentStageId: (data.current_stage_id as string | null) ?? null,
  };
}

// Move to the next stage by position within the same requisition. Stamps
// decided_at when that stage is terminal.
export async function advanceApplicationStage(applicationId: string): Promise<Result> {
  const app = await loadApp(applicationId);
  if (!app) return { ok: false, error: "Application not found." };
  const stages = await reqStages(app.reqId);
  if (stages.length === 0) return { ok: false, error: "This role has no pipeline stages." };

  const curIdx = app.currentStageId ? stages.findIndex((s) => s.id === app.currentStageId) : -1;
  // A set current stage that isn't in this req's pipeline is a data problem, not
  // "start from the beginning"; refuse rather than silently reset to stage one.
  if (app.currentStageId && curIdx === -1) {
    return { ok: false, error: "This candidate's current stage is not in the role's pipeline." };
  }
  const next = stages[curIdx + 1];
  if (!next) return { ok: false, error: "Already at the final stage." };

  const updates: CompanyOsUpdate<"applications"> = { current_stage_id: next.id };
  if (next.is_terminal) updates.decided_at = new Date().toISOString();
  const { error } = await companyOs.from("applications").update(updates).eq("id", applicationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Reject: move onto a terminal reject stage when the pipeline defines one, and
// always set status and decided_at so the candidate reads as closed everywhere.
export async function rejectApplicationStage(applicationId: string): Promise<Result> {
  const app = await loadApp(applicationId);
  if (!app) return { ok: false, error: "Application not found." };
  const stages = await reqStages(app.reqId);
  const rejectStage = stages.find((s) => s.is_terminal && /reject|declin/i.test(s.name));

  const updates: CompanyOsUpdate<"applications"> = { status: "rejected", decided_at: new Date().toISOString() };
  if (rejectStage) updates.current_stage_id = rejectStage.id;
  const { error } = await companyOs.from("applications").update(updates).eq("id", applicationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Stamp that a manager asked recruiting to book this candidate. Merges into
// applications.metadata (jsonb) so the daily interview-ingest DM can call out
// the request; there is no dedicated table for it by design.
export async function stampBookingRequested(applicationId: string): Promise<Result> {
  const { data: app, error: metaErr } = await companyOs.from("applications").select("metadata")
    .eq("id", applicationId)
    .maybeSingle();
  if (metaErr) return { ok: false, error: metaErr.message };
  if (!app) return { ok: false, error: "Application not found." };
  const meta = app.metadata && typeof app.metadata === "object" ? (app.metadata as Record<string, unknown>) : {};
  const next = { ...meta, booking_requested_at: new Date().toISOString() };
  const { error } = await companyOs.from("applications").update({ metadata: next }).eq("id", applicationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
