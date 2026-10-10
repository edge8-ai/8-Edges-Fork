"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import { runSyncedWrite, type Settled, type WriteHandlers } from "./settle-write";

// Decide whether local state should take a freshly rendered server value.
// Reference comparison is deliberate: server components produce a new array or
// object on every render, so a new identity means "the server re-rendered",
// and a mutation in flight means the optimistic local state must win until it
// settles. Kept pure so it can be unit-tested without a React renderer.
export function shouldAdoptServerValue<T>(prevServer: T, nextServer: T, pending: number): boolean {
  return pending === 0 && !Object.is(prevServer, nextServer);
}

/**
 * Runs one write against this state: in flight while it runs, released however
 * it ends, and the server asked again only when it did not take the write.
 * Resolves with the settled result and never rejects on a failed write.
 */
export type SyncedRun = <R extends Result>(write: () => Promise<R>, handlers?: WriteHandlers<R>) => Promise<Settled<R>>;

export type ServerSyncControls = {
  // Number of mutations currently in flight. Boards pass `pending > 0` to
  // KanbanBoard's `disabled` so a second drag cannot start mid-write.
  pending: number;
  // The only way to put a write in flight. There is no public begin/end
  // (A.33): a bracket written by hand is how a rejected request left the count
  // above zero for the life of the page, on two screens after it was fixed on
  // a third.
  run: SyncedRun;
};

// Local state seeded from a server-rendered prop that keeps following the prop.
// Without this hook the component would seed `useState` once and ignore every
// later prop, so server-side effects of a move (positions renumbered, closed
// dates, another admin's changes) stayed invisible until a hard reload.
//
// Contract: `serverValue` is mirrored into `state` whenever its identity changes
// and no mutation is in flight (`pending === 0`). `run` brackets a mutation
// (settle-write.ts holds the order). A prop change seen while pending is
// recorded but not adopted, so the *next* change after the release is what
// syncs.
//
// For a server action that revalidates, that next change is the action's own
// response, and no refresh is needed to produce it (W.196). Next applies the
// re-rendered page in a transition, while the release is an ordinary
// update, which React commits first; so `pending` is already 0 when the new
// value arrives. Seen on 2026-10-08: ten single moves and a back-to-back pair
// each ended on the server's latest render with no refresh. A change that
// arrives while ANOTHER mutation is still in flight is still held back, which
// is what keeps an earlier move's response from pulling a later card back.
//
// Failure handling is "server-truth rollback": `run` refreshes after a write
// the server refused or never answered, and the hook re-syncs from what the
// server says. A refused write revalidated nothing, so the refresh is the only
// new value.
export function useServerSyncedState<T>(
  serverValue: T,
): [T, Dispatch<SetStateAction<T>>, ServerSyncControls] {
  const router = useRouter();
  const [state, setState] = useState<T>(serverValue);
  const [seenServer, setSeenServer] = useState<T>(serverValue);
  const [pending, setPending] = useState(0);

  // Adjusting state in response to a prop change during render (rather than in
  // an effect) is the React-documented pattern: it avoids painting one frame of
  // stale data before the sync lands.
  if (!Object.is(seenServer, serverValue)) {
    setSeenServer(serverValue);
    if (shouldAdoptServerValue(seenServer, serverValue, pending)) setState(serverValue);
  }

  const run = useCallback<SyncedRun>(
    (write, handlers = {}) =>
      runSyncedWrite(write, handlers, {
        begin: () => setPending((n) => n + 1),
        end: () => setPending((n) => Math.max(0, n - 1)),
        rollback: () => router.refresh(),
      }),
    [router],
  );

  return [state, setState, { pending, run }];
}
