import { runLoop, type StepResult as RunStepResult } from "@/kernel/audit/run-loop";
import type { DrivenAgent, DrivenRun } from "@/kernel/audit/step-driver";
import { notifyMarketing } from "@/kernel/messaging/lark";

// The writer and letter agents' view of the shared run loop. The loop itself
// moved to kernel/audit/run-loop.ts with Z.13 (decision 10), so the meeting
// follow-up chain in crm runs on the same code; this file keeps the campaigns
// agents' own shape (a result names its `campaignId`) and their channel (the
// Marketing chat), so neither agent changed when the loop moved. It converts
// at the edges and does nothing else.

// What one step reports. `ok` with a `next` state means the step passed and
// says what runs next (a step id) or where the run parked (a state that is not
// a step); `ok: false` is a failed check; `skipped` is a tick with nothing to
// do — no run on this campaign, or a run that is already parked.
export type StepResult<Step extends string, State extends string> =
  | { ok: true; campaignId: string; step: Step; next: State; summary: string }
  | { ok: false; campaignId: string; step: Step; error: string }
  | { skipped: string; campaignId: string };

function toRun<Step extends string, State extends string>(r: StepResult<Step, State>): RunStepResult<Step, State> {
  if ("skipped" in r) return { skipped: r.skipped, id: r.campaignId };
  const { campaignId, ...rest } = r;
  return { ...rest, id: campaignId } as RunStepResult<Step, State>;
}

function fromRun<Step extends string, State extends string>(r: RunStepResult<Step, State>): StepResult<Step, State> {
  if ("skipped" in r) return { skipped: r.skipped, campaignId: r.id };
  const { id, ...rest } = r;
  return { ...rest, campaignId: id } as StepResult<Step, State>;
}

/**
 * One step's HTTP shape, shared by the step routes and the hub actions that
 * run a first step, because it is what the run recorder reads (Y.34): a tick
 * with nothing to do says `status: "skipped"`, and a failed check answers 422
 * so the run records as an error.
 */
export function stepResponse(result: StepResult<string, string>): Response {
  if ("skipped" in result) return Response.json({ status: "skipped", reason: result.skipped, ...result });
  if (!result.ok) return Response.json(result, { status: 422 });
  return Response.json(result);
}

export type AgentRunDefinition<Step extends string, State extends string> = {
  // The log prefix, "[writer]" or "[letter]".
  tag: string;
  // Where each step is recorded as a routine run (Settings -> Agents).
  routineId: string;
  // Seconds one step may take: the longest a step route or the driver may run.
  stepSeconds: number;
  advance: (campaignId: string) => Promise<StepResult<Step, State>>;
  // The run a campaign is at, or null when it is parked, stopped or finished.
  current: (campaignId: string) => Promise<DrivenRun | null>;
  // Every run at a step, for the driver.
  dueRuns: () => Promise<DrivenRun[]>;
  // Stop the run at `step` with `error` in the agent's own error column.
  stop: (campaignId: string, step: Step, error: string) => Promise<void>;
  // The message for ops when a passing step leaves the run parked at `next`,
  // or null when `next` is a step the driver will advance to.
  parked: (result: Extract<StepResult<Step, State>, { ok: true }>) => Promise<string | null> | string | null;
  // The message for ops when a step's check fails.
  stopped: (result: Extract<StepResult<Step, State>, { ok: false }>) => string;
  // The agent honours shadow mode (Z.17). The driver and a person's button
  // both pass it on, so the switch decides the mode of every step either runs.
  shadow?: boolean;
};

export function agentRunLoop<Step extends string, State extends string>(
  def: AgentRunDefinition<Step, State>,
): { run: (campaignId: string) => Promise<StepResult<Step, State>>; runNow: (campaignId: string) => Promise<StepResult<Step, State>>; driven: DrivenAgent } {
  const loop = runLoop<Step, State>({
    routineId: def.routineId,
    stepSeconds: def.stepSeconds,
    advance: async (id) => toRun(await def.advance(id)),
    current: def.current,
    dueRuns: def.dueRuns,
    stop: def.stop,
    parked: (r) => def.parked(fromRun(r) as Extract<StepResult<Step, State>, { ok: true }>),
    stopped: (r) => def.stopped(fromRun(r) as Extract<StepResult<Step, State>, { ok: false }>),
    notify: (message) => notifyMarketing(message),
    shadow: def.shadow,
  });
  return {
    run: async (campaignId) => fromRun(await loop.run(campaignId)),
    runNow: async (campaignId) => fromRun(await loop.runNow(campaignId)),
    driven: loop.driven,
  };
}
