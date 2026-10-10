"use server";

import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { restartProposal, startProposal, stopProposal, type StepResult } from "./proposal-chain";
import { loadDraft } from "./proposal-data";

// Starting, retrying and stopping a proposal run, and marking a meeting as a
// sales call (Z.10). Held by crm.calls, the atom of the meeting pages these
// buttons sit on.

type ActionResult = { ok: true; id?: string; note?: string } | { ok: false; error: string };

function refresh(meetingId: string | null, draftId?: string) {
  if (meetingId) revalidateSurfaces(`/revenue/meetings/${meetingId}`);
  if (draftId) revalidateSurfaces(`/revenue/proposals/${draftId}`);
}

function said(result: StepResult): string {
  if ("skipped" in result) return result.skipped;
  return result.ok ? `First step done: ${result.summary}.` : `The first step failed and is retried on the next tick: ${result.error}`;
}

/** Draft a proposal from a meeting now, whatever its type: opens the run and runs its first step. */
export async function draftProposalForMeeting(meetingId: string): Promise<ActionResult> {
  const access = await requirePermission("crm.calls");
  const { data, error } = await companyOs.from("meetings").select("id, company_id, ai_status, archived_at").eq("id", meetingId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || data.archived_at || !data.company_id) return { ok: false, error: "This meeting has no client company, so there is no one to propose to." };
  if (data.ai_status !== "ready") return { ok: false, error: "Wait for the meeting's summary first: the chain drafts from a summarised call." };
  const started = await startProposal(meetingId, data.company_id, access.personId);
  await recordAudit({ table: "proposal_drafts", recordId: started.id, operation: started.opened ? "insert" : "update", actor: access.user.email, context: { meetingId, started: started.opened } });
  refresh(meetingId, started.id);
  return { ok: true, id: started.id, note: started.opened ? said(started.result) : "A proposal run already exists for this meeting." };
}

/** Start a stopped, rejected or shadow run again under a new epoch. */
export async function retryProposal(id: string): Promise<ActionResult> {
  const access = await requirePermission("crm.calls");
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  const res = await restartProposal(id);
  refresh(row.meeting_id, id);
  if (!res.ok) return res;
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: access.user.email, context: { restarted: true } });
  return { ok: true, id, note: said(res.result) };
}

/** Stop a run that has not finished; its pending approval is withdrawn. */
export async function stopProposalRun(id: string): Promise<ActionResult> {
  const access = await requirePermission("crm.calls");
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  const res = await stopProposal(id, { personId: access.personId, email: access.user.email });
  refresh(row.meeting_id, id);
  if (!res.ok) return res;
  await recordAudit({ table: "proposal_drafts", recordId: id, operation: "update", actor: access.user.email, context: { stopped: true } });
  return { ok: true, id };
}

/** Mark a meeting as a sales call (or not): a Sales meeting is drafted from on the chain's next tick. */
export async function setMeetingSalesCall(meetingId: string, sales: boolean): Promise<ActionResult> {
  const access = await requirePermission("crm.calls");
  const { error } = await companyOs
    .from("meetings")
    .update({ meeting_type: sales ? "Sales" : "General", updated_at: new Date().toISOString() })
    .eq("id", meetingId)
    .not("company_id", "is", null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "meetings", recordId: meetingId, operation: "update", actor: access.user.email, context: { meeting_type: sales ? "Sales" : "General" } });
  refresh(meetingId);
  return { ok: true };
}
