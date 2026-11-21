"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import { loadBlogAsset, loadCampaign, setWriterState } from "./data";
import { LIVE_EDIT_REFUSAL, liveEditRefusal } from "../blog-live-edit";
import { runWriterStepNow } from "./run-step";
import { isWriterStep } from "./steps";
import { startWriterRun } from "./advance";
import { approvePublish, reaskPublish, rejectPublish, withdrawPublish } from "./publish-approval";
import type { Result } from "@/kernel/data/result";

// The hub's verbs on a writer run. Start executes the first step in this
// request so the operator sees movement at once; the tick driver carries the
// run from there (Y.12). Retry clears the error on the current step and runs
// it here; Continue runs the step the run is at now rather than wait for the
// next tick; Stop ends the run and keeps whatever the steps so far wrote on
// the assets. Publish and Reject decide the Publish approval a run at ready
// waits on (Y.16): Publish names the version the page showed, and publishes
// in this request once the approval is decided; the agent driver retries the
// publish step if it fails here.

const idSchema = z.string().uuid("Not a campaign id.");
const versionSchema = z.string().regex(/^[0-9a-f]{12}$/, "Not a post version.");

const WRITER_LIVE_REFUSAL =
  "This post is live and its campaign publishes on approval, so the writer cannot rewrite it while it is live. Unpublish it first (drag it out of Published on this hub's Workboard tab), then run the writer again; the run asks for approval when it finishes.";

function refresh(campaignId: string): void {
  revalidateSurfaces(`/revenue/marketing/campaigns/${campaignId}`);
}

export async function startWriter(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!loaded.data.brandId) return { ok: false, error: "Set a brand on this campaign first, so the writer knows the voice and process." };
  if (!loaded.data.idea?.trim()) return { ok: false, error: "Write the campaign idea first; it is the brief the writer works from." };
  if (isWriterStep(loaded.data.writerStep) && !loaded.data.writerError) {
    return { ok: false, error: "The writer is already running on this campaign." };
  }

  // A run rewrites the post in place, so a live post on a campaign that
  // publishes on approval is unpublished before the writer runs on it (Y.91);
  // the steps' writes would each refuse it, but only after the draft had
  // rewritten the channel posts. A campaign with no post yet has nothing live.
  const blog = await loadBlogAsset(parsed.data);
  if (blog.ok) {
    const live = await liveEditRefusal(blog.data.id);
    if (live) return { ok: false, error: live === LIVE_EDIT_REFUSAL ? WRITER_LIVE_REFUSAL : live };
  }

  // A run started again from ready leaves no approval waiting for a post that
  // is about to be rewritten.
  const withdrawn = await withdrawPublish(parsed.data, { personId, email: admin.email }, "the writer was started again");
  if (!withdrawn.ok) return withdrawn;
  const started = await startWriterRun(parsed.data);
  if (!started.ok) return started;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "start" } });

  // The first step runs here, recorded under its own tick like every other
  // step, so Settings -> Agents shows it and the driver never runs it again.
  const first = await runWriterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in first) return { ok: false, error: first.skipped };
  if (!first.ok) return { ok: false, error: first.error };
  return { ok: true };
}

export async function retryWriterStep(campaignId: string): Promise<Result> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isWriterStep(loaded.data.writerStep)) return { ok: false, error: "There is no step to retry." };

  // A new start time makes the retried step a new tick, so the driver counts
  // its attempts afresh rather than stopping it on the failures before.
  const cleared = await setWriterState(parsed.data, { step: loaded.data.writerStep, error: null, startedAt: new Date().toISOString() });
  if (!cleared.ok) return cleared;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "retry", step: loaded.data.writerStep } });
  const ran = await runWriterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in ran) return { ok: false, error: ran.skipped };
  if (!ran.ok) return { ok: false, error: ran.error };
  return { ok: true };
}

export async function continueWriter(campaignId: string): Promise<Result> {
  const { user: admin } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const loaded = await loadCampaign(parsed.data);
  if (!loaded.ok) return loaded;
  if (!isWriterStep(loaded.data.writerStep)) return { ok: false, error: "There is no run to continue." };
  if (loaded.data.writerError) return { ok: false, error: "The run stopped with an error; use Retry step." };

  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "continue", step: loaded.data.writerStep } });
  const ran = await runWriterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in ran) return { ok: false, error: ran.skipped };
  if (!ran.ok) return { ok: false, error: ran.error };
  return { ok: true };
}

export async function stopWriter(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const withdrawn = await withdrawPublish(parsed.data, { personId, email: admin.email }, "the run was stopped");
  if (!withdrawn.ok) return withdrawn;

  const stopped = await setWriterState(parsed.data, { step: null, error: null });
  if (!stopped.ok) return stopped;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "stop" } });
  refresh(parsed.data);
  return { ok: true };
}

export async function publishWriterDraft(campaignId: string, seenVersion: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };
  const version = versionSchema.safeParse(seenVersion);
  if (!version.success) return { ok: false, error: zodIssuesToMessage(version.error.issues) };

  const approved = await approvePublish(parsed.data, version.data, { personId, email: admin.email });
  refresh(parsed.data);
  if (!approved.ok) return approved;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "publish-approved", version: version.data } });
  // The publish step runs here, under its own tick, so the approver sees the
  // post go live; if it fails, the driver retries it on the next tick.
  const ran = await runWriterStepNow(parsed.data);
  refresh(parsed.data);
  if ("skipped" in ran) return { ok: true };
  if (!ran.ok) return { ok: false, error: `Approved, but the publish failed: ${ran.error}` };
  return { ok: true };
}

export async function rejectWriterDraft(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const rejected = await rejectPublish(parsed.data, { personId, email: admin.email });
  if (!rejected.ok) return rejected;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "publish-rejected" } });
  refresh(parsed.data);
  return { ok: true };
}

// Ask for approval: for a campaign whose writer is not running (no run, a
// finished run, a rejected one) and whose post every publish refuses (its
// approval withdrawn, rejected, or for an older version), open an approval for
// the post as it is, so Publish can decide it (./publish-approval reaskPublish).
export async function reaskWriterDraft(campaignId: string): Promise<Result> {
  const { user: admin, personId } = await requirePermission("campaigns.marketing");
  const parsed = idSchema.safeParse(campaignId);
  if (!parsed.success) return { ok: false, error: zodIssuesToMessage(parsed.error.issues) };

  const asked = await reaskPublish(parsed.data, { personId, email: admin.email });
  refresh(parsed.data);
  if (!asked.ok) return asked;
  await recordAudit({ table: "marketing_campaigns", recordId: parsed.data, operation: "update", actor: admin.email, context: { writer: "publish-reasked" } });
  return { ok: true };
}
