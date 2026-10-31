"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ActionNote = { tone: "ok" | "err"; text: string } | null;

// The "call a server action, then say what happened" closure that the campaign
// hub and the survey builder had written out twice, byte for byte apart from
// the name of the state. Both clear the banner, run the action inside a
// transition, show `okText` and refresh on success, and show the action's own
// error on failure.
//
// `fn` is typed on the widened shape rather than the house `Result` because the
// campaign hub passes actions whose failure branch is optional; the
// "Something went wrong." fallback is what covered that, and it stays.
export function useActionRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<ActionNote>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) {
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNote({ tone: "ok", text: okText });
        after?.();
        router.refresh();
      } else {
        setNote({ tone: "err", text: res.error ?? "Something went wrong." });
      }
    });
  }

  return { note, setNote, pending, startTransition, run, router };
}
