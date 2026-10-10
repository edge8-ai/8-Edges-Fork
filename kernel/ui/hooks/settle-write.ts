// How a client screen runs a server action so that it always settles.
//
// A server action does not only RESOLVE with { ok: false } — it REJECTS when the
// request never completes: a dropped connection, a 500, or the action-id skew a
// browser tab hits when a deployment lands under it. Code written as
// `write().then(...)` or `await write(); end();` has no path for that, so the
// in-flight count it raised is never lowered. On the Workboard that disabled
// every drag and stopped the board following the server until a reload; the
// fix lived in boards while the CRM deals board and the campaign hub kept the
// hand-written bracket and the bug. A.33 moved the fix here, behind
// useServerSyncedState's `run`, which is now the only way to raise that count.
//
// When to ask the server again is decided here too, once:
//   · a write it took needs nothing: every action these serve revalidates, and
//     an action that revalidates comes back with the page already re-rendered
//     (W.195, W.196), so a refresh would render it twice;
//   · a write it refused needs a refresh only if the screen moved ahead of it
//     (an optimistic write, runSyncedWrite); otherwise nothing changed;
//   · a request it never answered needs a refresh either way, because the
//     write may have landed with its response lost;
//   · a handler that threw left the screen in a state nobody chose, so it is
//     reported and the server's state is taken.
//
// Pure and React-free, so the order of every step is unit-tested without a
// renderer (this test runner has no DOM).

import type { Result } from "@/kernel/data/result";

/** A write that did not land: the server's refusal, or no answer at all. */
export type Refused = { ok: false; error: string; unanswered?: true };

/** What a settled write resolves with: the server's result, or a refusal. */
export type Settled<R extends Result> = R | Refused;

/** What the person sees when the request itself never completed. */
export const NO_ANSWER = "the server did not answer — reload the page and try again";

/**
 * Whether a write went unanswered: the request never completed, so it may have
 * landed with its response lost. Distinct from a refusal, which changed nothing.
 */
export function wasUnanswered(result: Settled<Result>): boolean {
  return !result.ok && "unanswered" in result && result.unanswered === true;
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : NO_ANSWER;
}

/**
 * Runs one write and returns what the server said, with a rejection turned into
 * a refusal marked `unanswered`. Never rejects, and a write that throws before
 * it returns a promise settles the same way. The write is called before the
 * first await, so a caller's transition scope still covers it (W.194).
 */
export async function settleWrite<R extends Result>(write: () => Promise<R>): Promise<Settled<R>> {
  try {
    return await write();
  } catch (err) {
    return { ok: false, error: messageOf(err), unanswered: true };
  }
}

export type WriteHandlers<R extends Result> = {
  /** Runs only when the server said yes, with what it returned. */
  onOk?: (result: Extract<R, { ok: true }>) => void;
  /** Shows a message to the person who made the change. */
  onError?: (message: string) => void;
};

/**
 * Settles the write and tells the handlers. A handler that throws is reported
 * through onError, and one that throws from onError is logged, so this never
 * rejects. Returns whether a handler threw.
 */
async function settleAndReport<R extends Result>(
  write: () => Promise<R>,
  { onOk, onError }: WriteHandlers<R>,
): Promise<{ result: Settled<R>; handlerThrew: boolean }> {
  const result = await settleWrite(write);
  try {
    if (result.ok) onOk?.(result as Extract<R, { ok: true }>);
    else onError?.(result.error);
    return { result, handlerThrew: false };
  } catch (err) {
    console.error("A write's handler threw", err);
    // A throwing onOk is told through onError. A throwing onError has already
    // run once, and running it again would repeat whatever it did first.
    if (result.ok) {
      try {
        onError?.(messageOf(err));
      } catch (again) {
        console.error("A write's onError threw while reporting", again);
      }
    }
    return { result, handlerThrew: true };
  }
}

/**
 * One write with nothing optimistic on screen. It refreshes only when the
 * request went unanswered or a handler threw; a refusal changed nothing, so it
 * is shown and left. Resolves with the settled result and never rejects.
 */
export async function runWrite<R extends Result>(
  write: () => Promise<R>,
  handlers: WriteHandlers<R>,
  { rollback }: { rollback: () => void },
): Promise<Settled<R>> {
  const { result, handlerThrew } = await settleAndReport(write, handlers);
  if (handlerThrew || wasUnanswered(result)) rollback();
  return result;
}

export type SyncedWriteBracket = {
  /** Marks a write in flight. */
  begin: () => void;
  /** Releases it, however the write ended. */
  end: () => void;
  /** Asks the server for its truth again, after a write it did not take. */
  rollback: () => void;
};

/**
 * One optimistic write: mark it in flight, run it, report it, release it, and
 * roll back whenever the server did not take it or a handler threw.
 *
 * Release ALWAYS precedes rollback, and the order is load-bearing:
 * useServerSyncedState refuses to adopt a new server value while its count is
 * above zero, so a rollback fired first would fetch the server's truth and
 * then be told to ignore it. Resolves with the settled result and never
 * rejects.
 */
export async function runSyncedWrite<R extends Result>(
  write: () => Promise<R>,
  handlers: WriteHandlers<R>,
  { begin, end, rollback }: SyncedWriteBracket,
): Promise<Settled<R>> {
  begin();
  const { result, handlerThrew } = await settleAndReport(write, handlers);
  end();
  if (handlerThrew || !result.ok) rollback();
  return result;
}

/**
 * The same guarantee for work that reports its own outcome: a chain of writes
 * folded into a form as each lands, or a call that returns a draft rather than
 * an ok flag. A request that never completes must say so rather than leave the
 * screen silent.
 */
export async function withRejectionReported(work: () => Promise<void>, onError: (message: string) => void): Promise<void> {
  try {
    await work();
  } catch (err) {
    onError(messageOf(err));
  }
}
