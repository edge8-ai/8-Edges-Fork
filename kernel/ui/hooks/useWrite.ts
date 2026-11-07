"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import { runWrite, type Settled, type WriteHandlers } from "./settle-write";

/**
 * Runs one write with nothing optimistic on screen: the server's answer is
 * shown, a refusal is left as it is, and the page asks the server again only
 * when the request went unanswered or a handler threw (settle-write.ts holds
 * the rules). Resolves with the settled result and never rejects.
 *
 * The optimistic counterpart is useServerSyncedState's `run`, which also
 * refreshes after a refusal because the screen moved ahead of the server.
 */
export type Write = <R extends Result>(write: () => Promise<R>, handlers?: WriteHandlers<R>) => Promise<Settled<R>>;

export function useWrite(): Write {
  const router = useRouter();
  return useCallback<Write>((write, handlers = {}) => runWrite(write, handlers, { rollback: () => router.refresh() }), [router]);
}
