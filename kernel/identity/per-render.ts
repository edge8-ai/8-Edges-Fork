// Memoisation for one request, in a render and in a server action or route handler alike.
//
// The identity guards run several times per request (the layout, the page and
// every guard each ask who is signed in), so they are memoised. React's cache()
// does that during a render, and only then: it hangs its store off the Flight
// request, and Next calls a server action or a route handler before any render
// (executeActionAndPrepareForRender), where cache() hands back a fresh Map on
// every call. So in an action every guard helper ran once per caller. The
// global search's guard made 45 to 56 requests per query, 27 to 35 of them one
// after another (SR.1.4, measured on production 17 Oct 2026).
//
// The second layer keys a memo on the request's cookie store, which Next keeps
// as one object per request and phase: userspaceMutableCookies while an action
// or route handler runs, the read-only store in the render after it. So a memo
// lasts the whole action, and the render that follows an action starts afresh:
// a write made in the action (a role granted, a grant revoked) is never
// answered from facts read before it. Outside a request (a cron with no request
// store, a script, a plain Node test) cookies() throws and the function runs
// bare, as before.
//
// React only exports cache() under the react-server condition, which Next sets
// and a plain Node test run does not, so its absence falls back to the bare
// function too.
import { cache } from "react";
import { cookies } from "next/headers";

type AsyncFn = (...args: never[]) => Promise<unknown>;

// One memo per cookie store, per wrapped function; both keys are objects, so
// a finished request's entries are collected with it.
const memos = new WeakMap<object, WeakMap<AsyncFn, Map<string, Promise<unknown>>>>();

/** The request's cookie store, or null outside a request. */
async function requestKey(): Promise<object | null> {
  try {
    return (await cookies()) as unknown as object;
  } catch (err) {
    // Next's own signals (a prerender bailing out to dynamic rendering, a
    // postpone) must reach Next; only "no request here" means run bare.
    if (isNextSignal(err)) throw err;
    return null;
  }
}

/**
 * What unstable_rethrow rethrows: Next marks its control-flow errors with a
 * string `digest` (dynamic usage, a hanging prerender promise, a bail-out to the
 * client), and React's postpone carries its own $$typeof. Checked here rather
 * than through next/navigation, which many suites mock with only redirect and
 * notFound.
 */
function isNextSignal(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { digest?: unknown; $$typeof?: unknown };
  return typeof e.digest === "string" || e.$$typeof === Symbol.for("react.postpone");
}

/** A memo key for primitive arguments; null when an argument is an object, which is never memoised. */
function argsKey(args: readonly unknown[]): string | null {
  if (args.some((a) => a !== null && typeof a === "object")) return null;
  return JSON.stringify(args.map((a) => (a === undefined ? "\u0000undefined" : a)));
}

function perRequest<T extends AsyncFn>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    const request = await requestKey();
    const key = argsKey(args);
    if (!request || key === null) return fn(...args);
    let byFn = memos.get(request);
    if (!byFn) memos.set(request, (byFn = new WeakMap()));
    let byArgs = byFn.get(fn);
    if (!byArgs) byFn.set(fn, (byArgs = new Map()));
    let hit = byArgs.get(key);
    if (!hit) byArgs.set(key, (hit = fn(...args)));
    return hit;
  }) as T;
}

export const perRender = <T extends AsyncFn>(fn: T): T => {
  const memoised = perRequest(fn);
  return typeof cache === "function" ? cache(memoised) : memoised;
};
