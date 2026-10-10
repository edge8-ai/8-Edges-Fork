"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Run one hiring chain action and say what happened (Z.9): the action's own
// notice when it has one, its error otherwise, and a refresh so the page
// shows where the chain moved. Shared by the requisition and application
// panels.

export type ChainNote = { tone: "ok" | "err"; text: string } | null;
type ChainActionResult = { ok: true; notice?: string } | { ok: false; error: string };

export function useChainAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<ChainNote>(null);
  function run(fn: () => Promise<ChainActionResult>, okText: string, after?: () => void) {
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNote({ tone: "ok", text: res.notice ?? okText });
        after?.();
      } else {
        setNote({ tone: "err", text: res.error });
      }
      // A refusal can still have moved the chain (an approval asked again), so refresh either way.
      router.refresh();
    });
  }
  return { pending, note, run };
}
