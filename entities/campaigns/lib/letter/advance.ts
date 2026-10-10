import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import type { StepResult } from "../run-loop";
import { loadLetter, setAgentState } from "./data";
import { runAsk } from "./send-approval";
import { runSend } from "./send-step";
import {
  describeLetterState,
  isLetterStep,
  LETTER_SCHEDULED,
  LETTER_STEPS,
  nextLetterState,
  type LetterDrivenStep,
  type LetterState,
  type LetterStepId,
} from "./steps";
import { runAssemble } from "./step-assemble";
import { runGather } from "./step-gather";
import { runPick } from "./step-pick";
import { runRotate } from "./step-rotate";
import { runValidate } from "./step-validate";
import { runWrite } from "./step-write";
import type { StepRunner } from "./types";

// The state machine. `advance` reads the broadcast's agent_step, runs that one
// step, and writes either the next state or the error back. One step per
// call, so every step fits the platform's request limit and has its own
// routine_runs row. The writing steps end at ready, where the run waits on its
// send approval; once approved it is scheduled, and the one step after that is
// the send, which the driver runs when it is due (./send-approval).

const RUNNERS: Record<LetterStepId, StepRunner> = {
  gather: runGather,
  pick: runPick,
  write: runWrite,
  rotate: runRotate,
  assemble: runAssemble,
  validate: runValidate,
  ask: runAsk,
};

// The step-result shape every agent shares (lib/run-loop.ts), with this agent's ids.
export type AdvanceResult = StepResult<LetterDrivenStep, LetterState>;

export async function advanceLetter(campaignId: string): Promise<AdvanceResult> {
  const loaded = await loadLetter(campaignId);
  if (!loaded.ok) return { skipped: loaded.error, campaignId };
  const letter = loaded.data;
  if (letter.agentStep === LETTER_SCHEDULED && !letter.agentError) {
    const step = LETTER_SCHEDULED;
    const sent = await runSend(letter);
    if (!sent.ok) {
      const saved = await setAgentState(campaignId, { step, error: sent.error });
      if (!saved.ok) console.error("[letter] could not record the send error:", saved.error);
      return { ok: false, campaignId, step, error: sent.error };
    }
    const saved = await setAgentState(campaignId, { step: sent.next, error: null });
    if (!saved.ok) return { ok: false, campaignId, step, error: `The send step passed but the state did not save: ${saved.error}` };
    return { ok: true, campaignId, step, next: sent.next, summary: sent.summary };
  }
  if (!isLetterStep(letter.agentStep)) {
    return { skipped: letter.agentStep ? describeLetterState(letter.agentStep as LetterState) : "No letter agent run on this broadcast.", campaignId };
  }
  if (letter.agentError) return { skipped: `Stopped at ${describeLetterState(letter.agentStep)}: ${letter.agentError}`, campaignId };
  if (letter.status !== "draft") return { skipped: `The broadcast is ${letter.status}; the agent only works on a draft.`, campaignId };
  const step = letter.agentStep;

  if (!letter.brandId) {
    const error = "The broadcast has no brand; the agent reads its voice and posts from the brand.";
    await setAgentState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }
  const profile = await getBrandProfile(letter.brandId);
  if (!profile) {
    const error = "Brand not found.";
    await setAgentState(campaignId, { step, error });
    return { ok: false, campaignId, step, error };
  }

  let result: Awaited<ReturnType<StepRunner>>;
  try {
    result = await RUNNERS[step]({ letter, profile });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!result.ok) {
    const saved = await setAgentState(campaignId, { step, error: result.error });
    if (!saved.ok) console.error("[letter] could not record the step error:", saved.error);
    return { ok: false, campaignId, step, error: result.error };
  }
  const next = nextLetterState(step);
  const saved = await setAgentState(campaignId, { step: next, error: null });
  if (!saved.ok) return { ok: false, campaignId, step, error: `Step passed but the state did not save: ${saved.error}` };
  return { ok: true, campaignId, step, next, summary: result.summary };
}

export async function startLetterRun(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return setAgentState(campaignId, { step: LETTER_STEPS[0].id, error: null, startedAt: new Date().toISOString() });
}
