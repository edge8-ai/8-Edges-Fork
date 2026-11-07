// The typed run result (Y.13, plan decision Y.80): what a routine returns, and
// the one rule by which the kernel decides what that makes the run. Kept apart
// from routine-runs.ts, which records runs, so the rule can be read and tested
// on its own; routine-runs.ts re-exports it for the routines.

/** One thing a run could not do: whom or what it was for, the step, and why. */
export type RoutineFailure = { subject: string; step: string; error: string };

/** How much of its work a run did: `done` below `expected` is an error run. */
export type RoutineOutcome = { expected: number; done: number; unit: string };

/**
 * What a routine returns (Y.13, plan decision Y.80). The routine states what
 * happened; the kernel decides what that makes the run, by one rule for every
 * routine (judgeResult). A routine never has to remember to turn its own
 * failures into a 500 and an `error` key, which is the step customer-status
 * missed (PR 1875) and four reimbursement and coaching crons missed (Y.88).
 * Any other key is a counter for the run's summary line and its result.
 */
export type RoutineResult = {
  status: "ok" | "skipped";
  reason?: string;
  outcome?: RoutineOutcome;
  failures?: RoutineFailure[];
  [counter: string]: unknown;
};

export type RoutineVerdict = { status: "ok" | "skipped" | "error"; error: string | null };

// The run's error line names at most this many failures, then counts the rest:
// routine_runs.error is read on a phone in Settings -> Agents and in the Ops alert.
const FAILURES_NAMED = 5;

function isRoutineFailure(value: unknown): value is RoutineFailure {
  const f = value as Partial<RoutineFailure> | null;
  return Boolean(f) && typeof f!.subject === "string" && typeof f!.step === "string" && typeof f!.error === "string";
}

function isOutcome(value: unknown): value is RoutineOutcome {
  const o = value as Partial<RoutineOutcome> | null;
  return Boolean(o) && typeof o!.expected === "number" && typeof o!.done === "number" && typeof o!.unit === "string";
}

/**
 * The kernel's outcome rule (Y.80). Failures make an error run whose error
 * names them; so does an outcome whose done falls short of expected, because
 * a run that meant to publish four pages and published none has not
 * succeeded, whatever else it did. Otherwise `status: "skipped"` is skipped and
 * anything else is ok. A body without these keys (a route not moved to the
 * typed result yet) is judged as before: only its status word counts.
 */
export function judgeResult(body: unknown): RoutineVerdict {
  const b = (body ?? {}) as Record<string, unknown>;
  const failures = Array.isArray(b.failures) ? b.failures.filter(isRoutineFailure) : [];
  if (failures.length > 0) {
    const named = failures.slice(0, FAILURES_NAMED).map((f) => `${f.subject} at ${f.step}: ${f.error}`);
    const more = failures.length - named.length;
    return { status: "error", error: named.join("; ") + (more > 0 ? `; and ${more} more` : "") };
  }
  if (isOutcome(b.outcome) && b.outcome.done < b.outcome.expected) {
    const { done, expected, unit } = b.outcome;
    return { status: "error", error: `done ${done} of ${expected} ${unit}` };
  }
  return { status: b.status === "skipped" ? "skipped" : "ok", error: null };
}

/**
 * The response a routine returns its typed result through. A run the kernel
 * judges an error answers 500 with the judged `error` in the body, so Vercel's
 * cron log, a Run-now button and routine_runs all say the same thing.
 */
export function routineResult(result: RoutineResult): Response {
  const verdict = judgeResult(result);
  if (verdict.status !== "error") return Response.json(result);
  return Response.json({ ...result, error: verdict.error }, { status: 500 });
}

/**
 * Failures from the "subject: why" lines a routine already collects: the text
 * before the first ": " is the subject, the rest the error. A line with no
 * subject is filed under `fallback`.
 */
export function failuresFrom(lines: string[], step: string, fallback: string): RoutineFailure[] {
  return lines.map((line) => {
    const at = line.indexOf(": ");
    return at > 0
      ? { subject: line.slice(0, at), step, error: line.slice(at + 2) }
      : { subject: fallback, step, error: line };
  });
}
