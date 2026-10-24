"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Result } from "@/kernel/data/result";

// Has the AI read one receipt again (RB.9): after the owner replaced a blurry
// photo, or when the first reading looks wrong. On a claim being checked only
// the reading and its warnings change; the owner's figures stay theirs. The
// page hands in the server action behind its own guard, as it does for the
// other decision controls, so the Team and Admin claim pages share it.
export function RereadReceipt({ claimId, itemId, reread }: { claimId: string; itemId: string; reread: (claimId: string, itemId: string) => Promise<Result> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const readAgain = () =>
    start(async () => {
      setError(null);
      const res = await reread(claimId, itemId);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  return (
    <span className="u-stack u-gap-1">
      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost u-w-auto" disabled={pending} onClick={readAgain}>
        {pending ? "Reading…" : "Read again"}
      </button>
      {error && <span className="admin-alert admin-alert--err">{error}</span>}
    </span>
  );
}
