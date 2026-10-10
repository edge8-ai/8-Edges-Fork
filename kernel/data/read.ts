// What a failed read means, said at the read (A.12).
//
// A PostgREST call hands back `{ data, error }`, and the repo's habit is
// `if (error) console.error(...)` followed by `return data ?? []`. That reads as
// handling the error — CLAUDE.md Rule 2 asks for exactly it — but the value the
// caller receives is the same one an empty table produces. The failure is gone
// by the time anything can act on it, so a database hiccup renders as absence:
// on 19 Sep 2026 three capability reads feeding the team hub's sidebar each
// returned false on a failed read, silently removing navigation from a person's
// hub, and `entities/team/lib/hiring.ts` did not bind `error` at all.
//
// The fix is not a third spelling of the same thing. It is to make the caller
// say which of two situations they are in, because only the caller knows:
//
//   mustRead / mustCount — a failure here produces a WRONG ANSWER. Raise it.
//     Anything that decides what a person may see or do, and any guard whose
//     "no rows" branch is the permissive one, belongs here.
//
//   readOr / countOr — a failure here costs something the page can do without.
//     The caller names the fallback, so the choice is visible in the code
//     rather than implied by a `?? []`, and the failure is still logged. These
//     deliberately collapse "failed" into "empty" — that is what tolerating a
//     failure means — which is exactly why they log and the must* ones do not.
//     Reach for them only when the fallback is a correct answer.
//
// Both are one line at the call site. The difference between them is the whole
// point: today the two cases are spelled identically and only a comment, when
// there is one, says which was meant.

/**
 * A read that could not be performed — distinct from a read that found nothing.
 * Thrown by `mustRead`/`mustCount` and rendered by the surface's error boundary
 * (`app/error.tsx` and the per-surface `error.tsx` files), which is a page the
 * person can retry rather than a screen that quietly lost a section.
 */
export class ReadFailure extends Error {
  readonly what: string;
  /** Not `cause`: the standard Error.cause holds an Error, this is its message. */
  readonly reason: string;
  constructor(what: string, reason: string) {
    super(`read failed: ${what}: ${reason}`);
    this.name = "ReadFailure";
    this.what = what;
    this.reason = reason;
  }
}

// A PostgREST response is a discriminated union — `{ data: T; error: null }` or
// `{ data: null; error: PostgrestError }` — so these take the response type
// itself and read the row type off it. Unifying the union against a single
// `{ data: T | null }` shape makes the compiler give up and infer `never`.
type Read = { data: unknown; error: { message: string } | null };
type Count = { count: number | null; error: { message: string } | null };

/**
 * `what` identifies the read in the log and the error: "[team/hub] staff_assignments".
 * Rows, never null: an empty result is `[]`, a failure is raised.
 */
export function mustRows<R extends { data: unknown[] | null; error: { message: string } | null }>(
  res: R,
  what: string,
): NonNullable<R["data"]> {
  if (res.error) throw new ReadFailure(what, res.error.message);
  return (res.data ?? []) as NonNullable<R["data"]>;
}

/**
 * A count, never defaulted. `head: true` counts come back with `data: null`, so
 * a missing count with no error is a genuine zero.
 */
export function mustCount(res: Count, what: string): number {
  if (res.error) throw new ReadFailure(what, res.error.message);
  return res.count ?? 0;
}

/**
 * The tolerant read. The caller states what the page shows when the read fails,
 * and the failure is logged rather than lost. Use when the fallback is a
 * genuinely acceptable answer — not because handling the error is awkward.
 */
// `F` is separate from the row type so the fallback can be a different shape —
// most often `null` or `[]`, which would otherwise collapse the row type to
// `never` when the compiler tried to unify the two.
export function readOr<R extends Read, F>(res: R, what: string, fallback: F): NonNullable<R["data"]> | F {
  if (res.error) {
    console.error(`[read] ${what}`, res.error.message);
    return fallback;
  }
  return (res.data ?? fallback) as NonNullable<R["data"]> | F;
}

/** `readOr` for a count. */
export function countOr(res: Count, what: string, fallback: number): number {
  if (res.error) {
    console.error(`[read] ${what}`, res.error.message);
    return fallback;
  }
  return res.count ?? fallback;
}
