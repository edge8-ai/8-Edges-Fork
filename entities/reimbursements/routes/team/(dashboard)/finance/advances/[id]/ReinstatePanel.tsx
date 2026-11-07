"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { reinstateCancelledAdvance } from "../actions";

// Finance's way back when an owner cancelled after the money had gone (AD.16). The wording warns
// off the wrong click, because nothing here can check the bank: it brings the advance back to life.
export function ReinstatePanel(props: { advanceId: string; owner: string; approvedBy: string | null; may: MayProp }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!props.may["reimbursements.pay"]) return null;

  const putBack = () =>
    start(async () => {
      setError(null);
      const result = await reinstateCancelledAdvance(props.advanceId, reason);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Already sent it?</h2>
      <p className="u-m-0 u-mb-3">Only if the money has really left the account. This puts the advance back to approved so you can record the transfer. If it has not gone, leave this alone and the cancel stands.</p>
      <label className="admin-label" htmlFor="advance-reinstate-reason">What happened? {props.owner} reads this.</label>
      <textarea id="advance-reinstate-reason" className="admin-textarea" rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
      <div className="admin-form-actions u-mt-2">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !reason.trim()} onClick={putBack}>Put it back to approved</button>
      </div>
      <p className="admin-hint u-m-0 u-mt-2">{props.owner} is told.{props.approvedBy ? ` ${props.approvedBy} stays as the approver on the papers.` : ""}</p>
    </section>
  );
}
