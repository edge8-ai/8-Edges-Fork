// Application pipeline moves for the manager verbs on /team: advance, reject,
// and flag "please book this". Callers own authorization and cache
// revalidation. Advance and Reject are decisions made by hand, so they go
// through the one module every surface decides an application in (A.36):
// until then they wrote the row and nothing else, and a manager's rejection
// left the candidate's interviews booked.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import { changeApplicationByHand, type HandActor, type HandResult } from "../hand-decision";

export type { Result };

type StageRow = { id: string; name: string; position: number; is_terminal: boolean };
type Read<T> = { ok: true; value: T } | { ok: false; error: string };

// Both reads feed a decision, so a failed one refuses rather than reading as
// "no stages" (Team Reject would then reject with no reject stage) or "no
// such application" (CLAUDE.md rule 2).
async function reqStages(reqId: string): Promise<Read<StageRow[]>> {
  const { data, error } = await companyOs.from("application_stages").select("id, name, position, is_terminal")
    .eq("job_requisition_id", reqId)
    .order("position");
  if (error) return { ok: false, error: `Could not read the role's pipeline stages: ${error.message}` };
  return { ok: true, value: (data ?? []) as StageRow[] };
}

async function loadApp(applicationId: string): Promise<Read<{ id: string; reqId: string; currentStageId: string | null }>> {
  const { data, error } = await companyOs.from("applications").select("id, job_requisition_id, current_stage_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) return { ok: false, error: `Could not read the application: ${error.message}` };
  if (!data) return { ok: false, error: "Application not found." };
  return {
    ok: true,
    value: {
      id: data.id as string,
      reqId: data.job_requisition_id as string,
      currentStageId: (data.current_stage_id as string | null) ?? null,
    },
  };
}

// A manager in Team cannot propose a decision (that needs hiring.ats), so the
// chain's refusal is said in their words rather than pointing them at a page
// they cannot open.
export const MANAGER_ASKS_RECRUITING =
  "This candidate is in the hiring chain, so recruiting proposes the decision and a Hiring approver makes it. Ask recruiting to propose it.";

function managerResult(res: HandResult): Result {
  if (res.ok) return { ok: true };
  return { ok: false, error: res.inLiveChain ? MANAGER_ASKS_RECRUITING : res.error };
}

// Move to the next stage by position within the same requisition. A terminal
// next stage is the decision, stamped as the admin board stamps it.
export async function advanceApplicationStage(applicationId: string, by: HandActor): Promise<Result> {
  const loaded = await loadApp(applicationId);
  if (!loaded.ok) return loaded;
  const app = loaded.value;
  const read = await reqStages(app.reqId);
  if (!read.ok) return read;
  const stages = read.value;
  if (stages.length === 0) return { ok: false, error: "This role has no pipeline stages." };

  const curIdx = app.currentStageId ? stages.findIndex((s) => s.id === app.currentStageId) : -1;
  // A set current stage that isn't in this req's pipeline is a data problem, not
  // "start from the beginning"; refuse rather than silently reset to stage one.
  if (app.currentStageId && curIdx === -1) {
    return { ok: false, error: "This candidate's current stage is not in the role's pipeline." };
  }
  const next = stages[curIdx + 1];
  if (!next) return { ok: false, error: "Already at the final stage." };
  return managerResult(await changeApplicationByHand(applicationId, { stageId: next.id }, by));
}

// Reject: move onto a terminal reject stage when the pipeline defines one, and
// always set the status so the candidate reads as closed everywhere.
export async function rejectApplicationStage(applicationId: string, by: HandActor): Promise<Result> {
  const loaded = await loadApp(applicationId);
  if (!loaded.ok) return loaded;
  const read = await reqStages(loaded.value.reqId);
  if (!read.ok) return read;
  const rejectStage = read.value.find((s) => s.is_terminal && /reject|declin/i.test(s.name));
  return managerResult(await changeApplicationByHand(applicationId, { status: "rejected", stageId: rejectStage?.id }, by));
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
