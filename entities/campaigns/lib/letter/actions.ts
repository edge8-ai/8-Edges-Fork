"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { loadLetter, setAgentState } from "./data";
import { runLetterStepNow } from "./run-step";
import { approveSend, cancelSend, rejectSend } from "./send-approval";
import { isLetterStep, LETTER_READY, LETTER_SCHEDULED } from "./steps";
import { startLetterRun } from "./advance";
import type { Result } from "@/kernel/data/result";

// The hub's verbs on a letter agent run: start (runs the first step in this
// request so the operator sees movement; the tick driver carries the rest,
// Y.12), retry a stopped step here, continue (run the step the run is at now
// rather than wait for the next tick), stop. Approve and Reject decide the
// letter_send approval a run at ready waits on (Y.17, decision Y.54): Approve
// names the version the page showed and schedules the send for the window; the
// agent driver sends it once it is due. Cancelling a scheduled letter is the
// broadcast's own Cancel, which withdraws the approval too.

const idSchema = z.string().uuid("Not a broadcast id.");
const versionSchema = z.string().regex(/^[0-9a-f]{12}$/, "Not a letter version.");

function refresh(id: string): void {
  revalidateSurfaces(`/revenue/marketing/broadcasts/${id}`);
}

export async function startLetter(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  if (loaded.data.status !== "draft") return { ok: false, error: "The agent only writes a draft broadcast." };
  if (!loaded.data.brandId) return { ok: false, error: "Set a brand on this broadcast first; the agent reads its voice and posts from the brand." };
  if (isLetterStep(loaded.data.agentStep) && !loaded.data.agentError) return { ok: false, error: "The agent is already running on this broadcast." };

  // A run started again from ready leaves no approval waiting on a letter that
  // is about to be rewritten.
  if (loaded.data.agentStep === LETTER_READY) {
    const withdrawn = await cancelSend(parsed.data, { personId, email: admin.email }, "the agent was started again");
    if (!withdrawn.ok) return withdrawn;
  }
  const started = await startLetterRun(parsed.data);
  if (!started.ok) return started;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "start" } });

  const first = await runLetterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in first) return { ok: false, error: first.skipped };
  if (!first.ok) return { ok: false, error: first.error };
  return { ok: true };
}

export async function retryLetterStep(campaignId: string): Promise<Result> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  const step = loaded.data.agentStep;
  // The send step stops too, and is retried the same way once it is due.
  if (!isLetterStep(step) && step !== LETTER_SCHEDULED) return { ok: false, error: "There is no step to retry." };
  // A new start time makes the retried step a new tick, so the driver counts
  // its attempts afresh rather than stopping it on the failures before.
  const cleared = await setAgentState(parsed.data, { step, error: null, startedAt: new Date().toISOString() });
  if (!cleared.ok) return cleared;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "retry", step } });
  const ran = await runLetterStepNow(parsed.data);
  refresh(parsed.data);
  // A send not yet due is not at a step: the driver runs it when it is.
  if ("skipped" in ran) return step === LETTER_SCHEDULED ? { ok: true } : { ok: false, error: ran.skipped };
  if (!ran.ok) return { ok: false, error: ran.error };
  return { ok: true };
}

export async function continueLetter(campaignId: string): Promise<Result> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isLetterStep(loaded.data.agentStep)) return { ok: false, error: "There is no run to continue." };
  if (loaded.data.agentError) return { ok: false, error: "The run stopped with an error; use Retry step." };
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "continue", step: loaded.data.agentStep } });
  const ran = await runLetterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in ran) return { ok: false, error: ran.skipped };
  if (!ran.ok) return { ok: false, error: ran.error };
  return { ok: true };
}

export async function stopLetter(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadLetter(parsed.data);
  if (!loaded.ok) return loaded;
  // Stopping a scheduled letter would leave the broadcast approved with
  // nothing to send it; that is the broadcast's Cancel.
  if (loaded.data.agentStep === LETTER_SCHEDULED) return { ok: false, error: "The letter is approved and scheduled; cancel the broadcast below to stop it." };
  if (loaded.data.agentStep === LETTER_READY) {
    const withdrawn = await cancelSend(parsed.data, { personId, email: admin.email }, "the run was stopped");
    if (!withdrawn.ok) return withdrawn;
  }
  const stopped = await setAgentState(parsed.data, { step: null, error: null });
  if (!stopped.ok) return stopped;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "stop" } });
  refresh(parsed.data);
  return { ok: true };
}

export async function approveLetterSend(campaignId: string, seenVersion: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const version = versionSchema.safeParse(seenVersion);
  if (!version.success) return { ok: false, error: zodIssuesToMessage(version.error.issues) };

  const approved = await approveSend(parsed.data, version.data, { personId, email: admin.email });
  refresh(parsed.data);
  if (!approved.ok) return approved;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "send-approved", version: version.data } });
  return { ok: true };
}

export async function rejectLetterSend(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const rejected = await rejectSend(parsed.data, { personId, email: admin.email });
  refresh(parsed.data);
  if (!rejected.ok) return rejected;
  await recordAudit({ table: "email_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { letterAgent: "send-rejected" } });
  return { ok: true };
}
