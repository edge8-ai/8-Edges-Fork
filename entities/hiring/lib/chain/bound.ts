import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import { classifyForVersion } from "@/kernel/approvals/versioned";
import type { Result } from "@/kernel/data/result";
import type { ChainDeps } from "./types";

// How the chain binds an approver's press to the approval row and the version
// the page showed (spec section 3c), by the kernel's version rule (A.38). Split
// from ./approvals, which holds what each press then does.

export type Actor = { personId: string | null; email: string };

const CHANGED = "It changed since this page was loaded, so it has been asked for again. Read it again, then approve.";
const RELOAD = "It changed since this page was loaded, and the approval waiting is for it as it is now. Reload, read it again, then approve.";
export const NOT_WAITING = "Nothing here waits on an approval any more; the page may be out of date.";
const LOST = "Someone else decided it first. The page now shows what they decided.";

// `resume`: the version as it is now was approved and the chain never moved
// on (the decision landed, the write after it did not), so the press moves it
// on without deciding twice (A.38). Before A.38 that press read "nothing waits".
type Bound = { ok: true; approvalId: string; requestedBy: string | null; resume: boolean } | { ok: false; error: string };

/** The approval for exactly the content as it is now, read through the chain's port and judged by the kernel's version rule. */
export async function bind(deps: ChainDeps, subject: ApprovalSubject, subjectId: string, current: string, seen: string, askAgain: () => Promise<Result>): Promise<Bound> {
  const found = classifyForVersion(await deps.approvals.latest(subject, subjectId), seen, current);
  switch (found.outcome) {
    case "already-approved":
      return { ok: true, approvalId: found.latest.id, requestedBy: found.latest.requestedBy, resume: true };
    case "decide":
      return { ok: true, approvalId: found.pending.id, requestedBy: found.pending.requestedBy, resume: false };
    case "reload":
      return { ok: false, error: RELOAD };
    case "ask-again": {
      // Nothing pending at all: the chain itself asks when it reaches the step.
      if (!found.stalePending) return { ok: false, error: NOT_WAITING };
      const again = await askAgain();
      return { ok: false, error: again.ok ? CHANGED : `${CHANGED} (Asking again failed: ${again.error})` };
    }
  }
}

export async function decide(deps: ChainDeps, subject: ApprovalSubject, subjectId: string, state: "approved" | "rejected", by: Actor, opts: { version?: string; approvalId?: string; reason?: string | null }): Promise<Result> {
  const res = await deps.approvals.decide({
    subjectType: subject,
    subjectId,
    state,
    decidedBy: by.personId,
    reason: opts.reason ?? null,
    ...(opts.approvalId && opts.version ? { expect: { id: opts.approvalId, version: opts.version } } : {}),
  });
  if (!res.ok) return res;
  return res.decided ? { ok: true } : { ok: false, error: LOST };
}

/** Approve what `bind` found: decide it, or, when it was already approved, only move on. */
export function approveBound(deps: ChainDeps, subject: ApprovalSubject, subjectId: string, by: Actor, bound: Extract<Bound, { ok: true }>, version: string): Promise<Result> {
  if (bound.resume) return Promise.resolve({ ok: true });
  return decide(deps, subject, subjectId, "approved", by, { approvalId: bound.approvalId, version });
}

