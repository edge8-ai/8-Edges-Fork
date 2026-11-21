// One move on the Asks page in flight (AK.2): busy while it runs, its refusal
// kept to show beside the button, and the page refreshed once it lands, so the
// lists and the sidebar's count are read again from the server.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Result } from "@/kernel/data/result";

/**
 * What the row says when a move threw instead of answering: the network
 * dropped, or the action failed in a way it did not report. A thrown action's
 * own message is no use to the reader (production hides it behind a digest),
 * so the row says plainly that nothing happened.
 */
export const DID_NOT_GO_THROUGH = "That didn't go through. Try again.";

/**
 * A move's answer, with a throw answered as a refusal, so the caller always
 * gets a Result and never a rejection. Without it, the busy flag set before the
 * move was never cleared and the button stayed disabled until a reload.
 * kernel/ui/RecordHistory's settledPage is the same rule for a load (S.19.14).
 */
export async function settledMove(move: () => Promise<Result>): Promise<Result> {
  try {
    return await move();
  } catch (err) {
    console.error("[quests/asks] a move threw", err);
    return { ok: false, error: DID_NOT_GO_THROUGH };
  }
}

export function useAskMove() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(move: () => Promise<Result>, landed?: () => void): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await settledMove(move);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    landed?.();
    router.refresh();
  }
  return { busy, error, run, refresh: () => router.refresh() };
}
