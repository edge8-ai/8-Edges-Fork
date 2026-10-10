import type { DrivenRun } from "@/kernel/audit/step-driver";
import { companyOs } from "@/kernel/data/supabase";
import { agentRunLoop } from "../run-loop";
import { advance } from "./advance";
import { loadBlogAsset, loadCampaign, setWriterState } from "./data";
import { describeState, isWriterStep, WRITER_DONE, WRITER_READY, WRITER_ROUTINE_ID, WRITER_STEPS } from "./steps";

// The writer agent's run, as the shared run loop executes it (lib/run-loop.ts).
// A run starts from the hub's button or the daily schedule, which run its first
// step at once; the tick driver (the agent-driver cron, Y.12) carries it one
// step per tick from there, with no open browser tab. What is the writer's
// here: how to find its runs, which states park one and what ops hears then.
// Its routine id lives in ./steps, beside the states, so the Publish approval
// (./publish-approval) can name the run's waiting row without this module.

/** Every campaign whose writer run is at a step, for the tick driver. */
async function dueWriterRuns(): Promise<DrivenRun[]> {
  const { data, error } = await companyOs
    .from("marketing_campaigns")
    .select("id, writer_step, writer_started_at")
    .is("writer_error", null)
    .in("writer_step", WRITER_STEPS.map((s) => s.id));
  if (error) throw new Error(`marketing_campaigns: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, epoch: r.writer_started_at, step: r.writer_step as string }));
}

const loop = agentRunLoop({
  tag: "writer",
  routineId: WRITER_ROUTINE_ID,
  // The writer-agent step route's maxDuration.
  stepSeconds: 300,
  advance,
  current: async (id) => {
    const loaded = await loadCampaign(id);
    if (!loaded.ok || loaded.data.writerError || !isWriterStep(loaded.data.writerStep)) return null;
    return { id, epoch: loaded.data.writerStartedAt, step: loaded.data.writerStep };
  },
  dueRuns: dueWriterRuns,
  stop: async (id, step, error) => {
    const set = await setWriterState(id, { step, error });
    if (!set.ok) console.error(`[writer] could not stop ${id} at ${step}: ${set.error}`);
  },
  // ready: the post passed every check and waits on a Publish approval.
  // done: every channel is written and the post is live or scheduled.
  parked: async (r) => {
    if (r.next === WRITER_READY) {
      return `Writer agent: campaign ${r.campaignId} is ready to publish and waits on a Publish approval. ${r.summary} Review and publish: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/revenue/marketing/campaigns/${r.campaignId}/`;
    }
    if (r.next === WRITER_DONE) {
      const blog = await loadBlogAsset(r.campaignId);
      const live = blog.ok && blog.data.postedUrl ? blog.data.postedUrl : "(live URL not recorded)";
      return `Writer agent: campaign ${r.campaignId} published. ${live}`;
    }
    return null;
  },
  stopped: (r) => `Writer agent: campaign ${r.campaignId} stopped at ${describeState(r.step)}. ${r.error}`,
});

export const runWriterStep = loop.run;
export const runWriterStepNow = loop.runNow;
export const writerDriven = loop.driven;
