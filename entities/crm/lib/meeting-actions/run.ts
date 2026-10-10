import { withdrawPendingApproval } from "@/kernel/approvals/requests";
import { latestApproval } from "@/kernel/approvals/waiting";
import { closeParkedRun } from "@/kernel/audit/parked-runs";
import { decideRunMode } from "@/kernel/audit/routine-runs";
import { currentRunMode } from "@/kernel/audit/run-context";
import { runLoop } from "@/kernel/audit/run-loop";
import type { DrivenRun } from "@/kernel/audit/step-driver";
import { tickScope } from "./checks";
import { dueRuns, loadRun, openRun, readyRunsSince, updateRunAt, type FollowupRun, type RunMode } from "./data";
import { draft, extract, gather } from "./draft-steps";
import { ask, send } from "./send-steps";
import { openCandidates } from "./sources";
import { fail, MEETING_FOLLOWUP, type Result } from "./step-kit";
import { EXPIRE_AFTER_DAYS, MEETING_ACTIONS_ROUTINE_ID, OPEN_PER_TICK, isFollowupStep, type FollowupState, type FollowupStep } from "./steps";

// The meeting-to-actions run (Z.13, spec section 3), one step per tick of the
// crm driver, each step a routine run under MEETING_ACTIONS_ROUTINE_ID with the
// tick `<run id>:<started at>:<step>` (ADR 0015), so a step a person's button
// runs and the one the driver runs are never both run.
//
//   gather   reads the meeting, its transcript and the company's contacts.
//   extract  asks the model for the agreed actions and writes them, once.
//   draft    asks the model for the follow-up and checks it.
//   ask      opens the approval, parks the run, and tells the approver once.
//   send     sends the approved version, once, from the approver's address.
//
// Shadow (Z.17): the switch on MEETING_ACTIONS_ROUTINE_ID decides the mode of
// every step. A run that meets shadow proposes its items (the boards filer
// never files a proposed item), closes `shadowed` after its draft, and stays a
// shadow run for good: it opens no approval, sends no DM and no email. The
// kernel's senders hold back in shadow on their own; the approval and the
// item states are this chain's own effects, so it asks currentRunMode().
//
// Cards are not filed here: boards requires crm, so the boards meeting-cards
// cron pulls the items marked to_file (decision 1).

// ── The loop ─────────────────────────────────────────────────────────────────

const STEPS: Record<FollowupStep, (run: FollowupRun) => Promise<Result>> = { gather, extract, draft, ask, send };

/** Run the one step the run is at. A thrown error is a failed step, never a half-written row. */
export async function advanceFollowup(id: string): Promise<Result> {
  let run: FollowupRun | null;
  try {
    run = await loadRun(id);
  } catch (err) {
    return { skipped: `The run could not be read: ${err instanceof Error ? err.message : String(err)}`, id };
  }
  if (!run) return { skipped: "No such follow-up run.", id };
  if (!isFollowupStep(run.step)) return { skipped: `The run is at ${run.step}.`, id };
  const step = run.step;
  try {
    return await STEPS[step](run);
  } catch (err) {
    return fail(run, step, err instanceof Error ? err.message : String(err));
  }
}

async function currentFollowup(id: string): Promise<DrivenRun | null> {
  const run = await loadRun(id);
  if (!run || !isFollowupStep(run.step)) return null;
  return { id, epoch: run.startedAt, step: run.step };
}

async function stopFollowup(id: string, step: FollowupStep, error: string): Promise<void> {
  const landed = await updateRunAt(id, step, { step: "stopped", error: error.slice(0, 1000) || "Stopped." });
  if (!landed) console.error(`[meeting-actions] ${id}: could not stop the run at ${step}`);
}

const loop = runLoop<FollowupStep, FollowupState>({
  routineId: MEETING_ACTIONS_ROUTINE_ID,
  // The crm driver's maxDuration, which every step runs inside.
  stepSeconds: 300,
  advance: advanceFollowup,
  current: currentFollowup,
  dueRuns,
  stop: stopFollowup,
  // The approver hears through the approval and its one DM, and Operations
  // through the routine alert (two failed runs in a row) and the stopped
  // run's error on the meeting page, so the loop posts nothing of its own.
  parked: () => null,
  stopped: (r) => `Meeting follow-up ${r.id} stopped at ${r.step}: ${r.error}`,
  notify: async () => undefined,
  shadow: true,
});

export const runFollowupStepNow = loop.runNow;
export const meetingActionsDriven = loop.driven;

// ── The driver's sweeps ──────────────────────────────────────────────────────

/** The mode a run the tick opens starts in: the chain's switch, or shadow inside a shadow tick. */
async function openingMode(): Promise<RunMode | null> {
  const decided = await decideRunMode(MEETING_ACTIONS_ROUTINE_ID, { honourPause: true, shadowCapable: true });
  if ("skip" in decided) return null;
  return decided.run === "shadow" || currentRunMode() === "shadow" ? "shadow" : "live";
}

/** Open runs for up to OPEN_PER_TICK ready meetings (spec section 2, "the tick"). */
export async function openReadyRuns(): Promise<{ opened: string[]; skipped: string | null }> {
  const mode = await openingMode();
  if (!mode) return { opened: [], skipped: "the chain's switch is off or could not be read" };
  const candidates = (await openCandidates(50)).filter((m) => tickScope(m).open).slice(0, OPEN_PER_TICK);
  const opened: string[] = [];
  for (const m of candidates) {
    const r = await openRun(m.id, mode);
    if (r.opened) opened.push(r.run.id);
  }
  return { opened, skipped: null };
}

/**
 * Expire drafts nobody decided within EXPIRE_AFTER_DAYS (decision 8): the
 * approval is withdrawn, the run closes `expired`, the wait closes. Nothing
 * is sent and nothing is approved on a timeout.
 */
export async function expireUndecided(now: Date = new Date()): Promise<{ expired: string[]; failures: { id: string; error: string }[] }> {
  const before = new Date(now.getTime() - EXPIRE_AFTER_DAYS * 86_400_000).toISOString();
  const runs = await readyRunsSince(before);
  const expired: string[] = [];
  const failures: { id: string; error: string }[] = [];
  for (const run of runs) {
    try {
      const latest = await latestApproval(MEETING_FOLLOWUP, run.id);
      const withdrawn = await withdrawPendingApproval({ subjectType: MEETING_FOLLOWUP, subjectId: run.id, cancelledBy: null, reason: "expired" }, "meeting-actions");
      if (!withdrawn.ok) {
        failures.push({ id: run.id, error: withdrawn.error });
        continue;
      }
      if (!(await updateRunAt(run.id, "ready", { step: "expired" }))) continue;
      const tick = typeof latest?.metadata.run === "string" ? latest.metadata.run : null;
      if (tick) await closeParkedRun(MEETING_ACTIONS_ROUTINE_ID, tick, { status: "skipped", summary: `expired unsent after ${EXPIRE_AFTER_DAYS} days` });
      expired.push(run.id);
    } catch (err) {
      failures.push({ id: run.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { expired, failures };
}
