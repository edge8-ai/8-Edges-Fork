"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";
import { closedLine, type CloseOutcome } from "./CloseReq";

/** A job just closed from its card, as the page reports it. */
export type ClosedRole = { id: string; title: string; outcome: CloseOutcome; wasLive: boolean };

// A job closed from its card leaves the cards at once, so the page says where
// it went and offers to undo it with the drawer's own reopen, which the caller
// hands in.
export function ClosedRoleNote({
  role,
  pastTitle = "Past jobs",
  reopen: reopenReq,
  onReopened,
}: {
  role: ClosedRole;
  /** The table the job moved to, by its heading. */
  pastTitle?: string;
  /** reopenJobReq for this job. */
  reopen: () => Promise<Result>;
  onReopened: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    setBusy(true);
    setError(null);
    const r = await reopenReq();
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onReopened();
    router.refresh();
  }

  return (
    <>
      <div className="admin-alert admin-alert--ok ats-note u-mb-4" role="status">
        <span>
          {closedLine(role.outcome)} {role.title || "The job"}{" "}
          {role.wasLive ? `is off the careers page and is now under ${pastTitle}.` : `is now under ${pastTitle}.`}
        </span>
        <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={reopen}>
          {busy ? "Reopening…" : "Reopen"}
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
    </>
  );
}
