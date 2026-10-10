import type { DrivenRun } from "@/kernel/audit/step-driver";
import { companyOs } from "@/kernel/data/supabase";
import { agentRunLoop } from "../run-loop";
import { advanceLetter } from "./advance";
import { loadLetter, setAgentState } from "./data";
import {
  describeLetterState,
  isLetterStep,
  LETTER_CANCELLED,
  LETTER_READY,
  LETTER_RELEASED,
  LETTER_ROUTINE_ID,
  LETTER_SCHEDULED,
  LETTER_STEPS,
} from "./steps";

// The letter agent's run, as the shared run loop executes it (lib/run-loop.ts;
// the tick driver advances it one step per tick since Y.12). What is the
// letter's here: a run that passes every check asks for its send approval and
// parks at ready (decision Y.54); nothing approves it but a person. Once
// approved it is scheduled, and the driver runs its send step on the first
// tick after the due time (Y.17), never before: a scheduled letter is not "at
// a step" until then. The Marketing chat hears that the letter waits on its
// approval, that it went to the send, and where a run stopped. The routine id
// lives in ./steps, beside the states.

function origin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

function readyForReview(r: { campaignId: string; summary: string }): string {
  return `Letter agent: this week's letter waits on its send approval and will not send until someone approves it. ${r.summary} Read and approve: ${origin()}/admin/revenue/marketing/broadcasts/${r.campaignId}/ (also in ${origin()}/team/approvals).`;
}

/** Every letter whose run is at a writing step, or whose approved send is due, for the tick driver. */
async function dueLetterRuns(now: Date = new Date()): Promise<DrivenRun[]> {
  const [writing, sending] = await Promise.all([
    companyOs
      .from("email_campaigns")
      .select("id, agent_step, agent_started_at")
      .eq("status", "draft")
      .is("agent_error", null)
      .is("archived_at", null)
      .in("agent_step", LETTER_STEPS.map((s) => s.id)),
    // A scheduled letter is driven only once its due time has passed; a
    // cancelled one has left `approved` and is not driven at all.
    companyOs
      .from("email_campaigns")
      .select("id, agent_step, agent_started_at")
      .in("status", ["approved", "sending"])
      .eq("agent_step", LETTER_SCHEDULED)
      .is("agent_error", null)
      .is("archived_at", null)
      .lte("scheduled_at", now.toISOString()),
  ]);
  if (writing.error) throw new Error(`email_campaigns: ${writing.error.message}`);
  if (sending.error) throw new Error(`email_campaigns: ${sending.error.message}`);
  return [...(writing.data ?? []), ...(sending.data ?? [])].map((r) => ({ id: r.id, epoch: r.agent_started_at, step: r.agent_step as string }));
}

function isDue(scheduledAt: string | null, now: Date = new Date()): boolean {
  return scheduledAt !== null && new Date(scheduledAt).getTime() <= now.getTime();
}

const loop = agentRunLoop({
  tag: "letter",
  routineId: LETTER_ROUTINE_ID,
  // The letter-agent step route's maxDuration.
  stepSeconds: 300,
  advance: advanceLetter,
  current: async (id) => {
    const loaded = await loadLetter(id);
    if (!loaded.ok || loaded.data.agentError) return null;
    const { agentStep, agentStartedAt, scheduledAt } = loaded.data;
    if (isLetterStep(agentStep)) return { id, epoch: agentStartedAt, step: agentStep };
    if (agentStep === LETTER_SCHEDULED && isDue(scheduledAt)) return { id, epoch: agentStartedAt, step: agentStep };
    return null;
  },
  dueRuns: () => dueLetterRuns(),
  stop: async (id, step, error) => {
    const set = await setAgentState(id, { step, error });
    if (!set.ok) console.error(`[letter] could not stop ${id} at ${step}: ${set.error}`);
  },
  parked: (r) => {
    if (r.next === LETTER_READY) return readyForReview(r);
    if (r.next === LETTER_RELEASED) return `Letter agent: broadcast ${r.campaignId} went to the send. ${r.summary}`;
    if (r.next === LETTER_CANCELLED) return `Letter agent: broadcast ${r.campaignId} did not send. ${r.summary}`;
    return null;
  },
  stopped: (r) => `Letter agent: broadcast ${r.campaignId} stopped at ${describeLetterState(r.step)}. ${r.error}`,
});

export const runLetterStep = loop.run;
export const runLetterStepNow = loop.runNow;
export const letterDriven = loop.driven;
