import { waitUntil } from "@vercel/functions";
import { recordRoutineRun } from "./routine-runs";
import { routineResult } from "./routine-result";

// Background AI jobs as routine runs (Y.24, plan Phase 5). A request that
// starts a meeting summary, a résumé screen, an interview score or a review
// summary answers the person at once and finishes the job after the response,
// under waitUntil. Until now that job left no run: a failure was a log line
// nobody read, and its AI calls had no run to belong to. runInBackground
// records it as a run of its own routine id, so it shows on Settings -> Agents
// with its tokens, its AI calls carry its run id, and two failures in a row
// alert Operations like any routine. It retries once: the jobs only write their
// own result columns, so a second attempt overwrites rather than duplicates.

/** What a background job answers: the shape every one of them already returns. */
export type JobOutcome = { ok: true } | { ok: false; error: string };

const RETRY_AFTER_MS = 5_000;

async function attempt(job: () => Promise<JobOutcome>): Promise<JobOutcome> {
  try {
    return await job();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Run one job and its retry, and answer as a routine does. Exported for its test. */
export async function backgroundJob(
  subject: string,
  job: () => Promise<JobOutcome>,
  retryAfterMs: number = RETRY_AFTER_MS,
): Promise<Response> {
  let outcome = await attempt(job);
  let attempts = 1;
  if (!outcome.ok) {
    await new Promise((r) => setTimeout(r, retryAfterMs));
    outcome = await attempt(job);
    attempts = 2;
  }
  return routineResult({
    status: "ok",
    subject,
    attempts,
    failures: outcome.ok ? [] : [{ subject, step: `attempt ${attempts}`, error: outcome.error }],
  });
}

/**
 * Start `job` after the response, recorded as a run of `routineId` (e.g.
 * "/background/resume-screen/"). `subject` names what it worked on, an id,
 * never a person's name or address: it is the run's summary and error line.
 */
export function runInBackground(routineId: string, subject: string, job: () => Promise<JobOutcome>): void {
  waitUntil(recordRoutineRun(routineId, () => backgroundJob(subject, job)));
}
