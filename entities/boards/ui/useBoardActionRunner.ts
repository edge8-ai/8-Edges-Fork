"use client";

import { useTransition, type TransitionStartFunction } from "react";
import { useWrite } from "@/kernel/ui/hooks/useWrite";
import type { RunAction } from "./board-view-types";

// One path for a board screen's server actions: clear the banner, run the
// action inside a React transition, and show the reason if the server refuses
// or never answers.
//
// It was written out by hand three times — Workboard, SprintPlanning and
// EpicsView — with identical bodies, and all three shared the same hole: the
// action was awaited with no rejection path, so a write that never completed
// left the screen silent instead of saying so. A helper is the only way three
// copies stay fixed (CLAUDE.md rule 3: never redeclare).
//
// There is no router.refresh() here, and that is deliberate (W.195). Every
// board action revalidates on success (card-helpers `refresh`), and a server
// action that revalidates anything comes back with the current page already
// re-rendered in its response, which the router applies. A refresh on top
// rendered the whole board a second time for every write: on the Workboard,
// five hundred cards drawn twice per tick. actions-revalidate.test.ts fails a
// board action that writes without revalidating, which is what this relies on.
// Nor is there one on a refusal: these writes change nothing on the page
// before the server answers, so a refused one has nothing to roll back. Only a
// request that went unanswered, or a handler that threw, asks the server again
// (useWrite, A.33). The optimistic writes go through useServerSyncedState's
// `run` instead.
//
// `startSaving` is returned as well because a caller may need to put its own
// work inside the same transition — the card form does.
export function useBoardActionRunner(setBanner: (message: string | null) => void): {
  saving: boolean;
  startSaving: TransitionStartFunction;
  run: RunAction;
} {
  const [saving, startSaving] = useTransition();
  const write = useWrite();
  const run: RunAction = (fn, onOk, onFail) => {
    setBanner(null);
    startSaving(async () => {
      await write(fn, {
        onOk: () => onOk?.(),
        onError: (message) => {
          setBanner(message);
          onFail?.();
        },
      });
    });
  };
  return { saving, startSaving, run };
}
