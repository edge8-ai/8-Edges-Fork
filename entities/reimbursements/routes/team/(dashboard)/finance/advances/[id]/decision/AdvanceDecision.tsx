"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { decideAdvance } from "./actions";

// The approver's three moves (AD.6). The buttons are offered only while the advance waits
// for a decision, which the page works out and the server asks again. It carries the
// request it was drawn from, so a decision never lands on one changed since.
export function AdvanceDecision(props: { advanceId: string; submittedAt: string; asker: string; own: boolean; youRecordIt: boolean; may: MayProp }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!props.may["reimbursements.approve"]) return null;

  const decide = (move: "approve" | "send_back" | "reject") => {
    if (move !== "approve" && !reason.trim()) return setError(`Give a reason first: it is what ${props.asker} reads.`);
    start(async () => {
      setError(null);
      const result = await decideAdvance(props.advanceId, move, { submittedAt: props.submittedAt, ...(move === "approve" ? {} : { reason }) });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  };

  // A reason is an objection on its way to being sent. Approving over one is a slip, and
  // an approval cannot be taken back once Finance has been told.
  const objecting = reason.trim() !== "";

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Your decision</h2>
      {props.own && <p className="admin-hint u-m-0 u-mb-3">This is your own advance. You may decide it as the employer.</p>}
      <div className="admin-field">
        <label className="admin-label" htmlFor="advance-decision-reason">Reason (needed to send back or reject)</label>
        <textarea id="advance-decision-reason" className="admin-textarea" rows={3} maxLength={2000} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} />
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
      <div className="admin-form-actions u-mt-4">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || objecting} onClick={() => decide("approve")}>Approve</button>
        <button type="button" className="admin-btn" disabled={pending} onClick={() => decide("send_back")}>Send back</button>
        <button type="button" className="admin-btn admin-btn--danger" disabled={pending} onClick={() => decide("reject")}>Reject</button>
      </div>
      <p className="admin-hint u-m-0 u-mt-2">
        {objecting
          ? "To approve, clear the reason: it is only for sending back or rejecting."
          : props.youRecordIt
            ? `Approved, you transfer it yourself, because ${props.asker} is the only other person who records transfers. Attach the bank's receipt when you record it.`
            : "Approved, Finance transfers it. Whoever approves an advance cannot record its payout."}
      </p>
    </section>
  );
}
