import { getBrandProfile, type BrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import type { StepResult } from "../run-loop";
import { loadBlogAsset, loadCampaign, setWriterState, type WriterCampaign } from "./data";
import { askToPublish, publishGate } from "./publish-approval";
import { describeState, isWriterStep, nextState, WRITER_READY, WRITER_STEPS, type WriterState, type WriterStepId } from "./steps";
import { runAssemble } from "./step-assemble";
import { runChannels } from "./step-channels";
import { runPublish } from "./step-publish";
import { runDraft } from "./step-draft";
import { runEdit } from "./step-edit";
import { runExhibits } from "./step-exhibits";
import { runHero } from "./step-hero";
import { runLinks } from "./step-links";
import { runSeo } from "./step-seo";
import { runValidate } from "./step-validate";
import type { StepRunner } from "./types";

// The state machine. `advance` reads the campaign's writer_step, runs that one
// step, and writes either the next state or the error back. It never runs two
// steps: each tick of the cron (or the hub's first call) is one step, which is
// what keeps every step inside the platform's request limit and gives every
// step its own routine_runs row.
//
// Two transitions also touch the Publish approval (Y.16, ./publish-approval).
// A step that parks the run at ready asks for the approval before the state is
// written, so a ready run always has one to wait on; if it cannot be asked for,
// the step stops with the reason and Retry runs it again (validate is a pure
// check, so that costs nothing). And a brand without auto-publish reaches the publish step only
// through an approval, so the step checks it first: when the post is not the
// version approved, the run goes back to ready with a new approval, under a new
// start time so the publish tick it reaches next is a fresh one.

const RUNNERS: Record<WriterStepId, StepRunner> = {
  draft: runDraft,
  edit: runEdit,
  seo: runSeo,
  exhibits: runExhibits,
  hero: runHero,
  links: runLinks,
  assemble: runAssemble,
  validate: runValidate,
  publish: runPublish,
  channels: runChannels,
};

// The step-result shape every agent shares (lib/run-loop.ts), with this agent's ids.
export type AdvanceResult = StepResult<WriterStepId, WriterState>;

export async function advance(campaignId: string): Promise<AdvanceResult> {
  const loaded = await loadCampaign(campaignId);
  if (!loaded.ok) return { skipped: loaded.error, campaignId };
  const campaign = loaded.data;
  if (!isWriterStep(campaign.writerStep)) {
    return { skipped: campaign.writerStep ? describeState(campaign.writerStep as WriterState) : "No writer run on this campaign.", campaignId };
  }
  if (campaign.writerError) return { skipped: `Stopped at ${describeState(campaign.writerStep)}: ${campaign.writerError}`, campaignId };
  const step = campaign.writerStep;

  if (!campaign.brandId) {
    const error = "The campaign has no brand; the writer reads its process from the brand profile.";
    await setWriterState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }
  const profile = await getBrandProfile(campaign.brandId);
  if (!profile) {
    const error = "Brand not found.";
    await setWriterState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }

  if (step === "publish" && !profile.autoPublish) {
    const held = await holdUnapprovedPublish(campaign, profile);
    if (held) return held;
  }

  let result: Awaited<ReturnType<StepRunner>>;
  try {
    result = await RUNNERS[step]({ campaign, profile });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!result.ok) {
    const saved = await setWriterState(campaignId, { step, error: result.error });
    if (!saved.ok) console.error("[writer] could not record the step error:", saved.error);
    return { ok: false, campaignId, step, error: result.error };
  }
  const next = nextState(step, profile.autoPublish);
  if (next === WRITER_READY) {
    const asked = await askFor(campaign, campaign.writerStartedAt, profile);
    if (!asked.ok) {
      const error = `${describeState(step)} passed, but the Publish approval could not be asked for: ${asked.error}`;
      await setWriterState(campaignId, { step, error });
      return { ok: false, campaignId, step, error };
    }
  }
  const saved = await setWriterState(campaignId, { step: next, error: null });
  if (!saved.ok) return { ok: false, campaignId, step, error: `Step passed but the state did not save: ${saved.error}` };
  return { ok: true, campaignId, step, next, summary: result.summary };
}

async function askFor(campaign: WriterCampaign, epoch: string | null, profile: BrandProfile): Promise<{ ok: true } | { ok: false; error: string }> {
  const blog = await loadBlogAsset(campaign.id);
  if (!blog.ok) return blog;
  return askToPublish(campaign, epoch, profile, blog.data);
}

// The publish step's gate for a brand that publishes on approval. Null lets the
// step run; a result ends the tick without publishing.
async function holdUnapprovedPublish(campaign: WriterCampaign, profile: BrandProfile): Promise<AdvanceResult | null> {
  const step = "publish" as const;
  const blog = await loadBlogAsset(campaign.id);
  if (!blog.ok) {
    await setWriterState(campaign.id, { step, error: blog.error });
    return { ok: false, campaignId: campaign.id, step, error: blog.error };
  }
  // A post already live is not compared by version: publishing a post with no
  // date gave it today's, which changes its version. The step closes it.
  if (blog.data.status === "published") return null;
  let gate: Awaited<ReturnType<typeof publishGate>>;
  try {
    gate = await publishGate(campaign.id, blog.data);
  } catch (err) {
    // Unread is not unapproved: fail the tick so the driver retries it, and
    // neither publish nor ask again on a guess.
    return { ok: false, campaignId: campaign.id, step, error: `Publish: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (gate.ok) return null;
  const epoch = new Date().toISOString();
  const asked = await askToPublish(campaign, epoch, profile, blog.data);
  if (!asked.ok) {
    const error = `Not published: ${gate.reason} A new approval could not be asked for: ${asked.error}`;
    await setWriterState(campaign.id, { step, error });
    return { ok: false, campaignId: campaign.id, step, error };
  }
  const saved = await setWriterState(campaign.id, { step: WRITER_READY, error: null, startedAt: epoch });
  if (!saved.ok) return { ok: false, campaignId: campaign.id, step, error: `Not published, and the run did not go back to ready: ${saved.error}` };
  return { ok: true, campaignId: campaign.id, step, next: WRITER_READY, summary: `Not published: ${gate.reason} A new Publish approval was asked for.` };
}

// Start (or restart from the top) a run: the first step is drafted next.
export async function startWriterRun(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return setWriterState(campaignId, { step: WRITER_STEPS[0].id, error: null, startedAt: new Date().toISOString() });
}
