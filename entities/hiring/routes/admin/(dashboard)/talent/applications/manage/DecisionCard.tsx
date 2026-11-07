"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { useChainAction } from "@/entities/hiring/ui/useChainAction";
import { proposeApplicationDecision, retryApplicationRun, withdrawApplicationDecision } from "@/entities/hiring/lib/chain/actions";
import { approveApplicationDecision, rejectApplicationDecision } from "@/entities/hiring/lib/chain/approve-actions";
import type { ApplicationChainView } from "@/entities/hiring/lib/chain/view";
import type { MayProp } from "@/kernel/identity/may-prop";

// The decision (Z.9, MessageAfter): for an application in the hiring chain,
// Hired and Rejected are proposed here, never set by the status select. One
// approval covers the decision and its message; a hire is never approved by
// whoever proposed it.

const OUTCOMES = [
  { value: "hired", label: "Hire", tier: "Tier 2 · commitment" },
  { value: "rejected", label: "Reject", tier: "Tier 1 · one candidate" },
] as const;

export function DecisionCard({ view, candidateName, roleTitle, may }: { view: ApplicationChainView; candidateName: string; roleTitle: string | null; may: MayProp }) {
  const canApprove = may["hiring.approve"] === true;
  const canRecruit = may["hiring.ats"] === true;
  const { pending, note, run } = useChainAction();
  const [outcome, setOutcome] = useState<"hired" | "rejected">("rejected");
  const [reason, setReason] = useState("");
  const [rejectWhy, setRejectWhy] = useState("");
  const d = view.decision;

  // A link to #decision (the status select's "Propose…") lands here once the page has streamed in.
  useEffect(() => {
    if (window.location.hash === "#decision") document.getElementById("decision")?.scrollIntoView({ block: "start" });
  }, []);

  const hire = d?.outcome === "hired";
  const waiting = d !== null && d.state === "pending";
  const selfHire = hire && d?.proposedByMe;
  const role = roleTitle ?? "the role";

  return (
    <section id="decision" className="admin-card admin-section-card" aria-label="Decision">
      <div className="u-row u-between u-wrap u-gap-2 u-mb-2">
        <div className="admin-section-label">Decision</div>
        {view.error && canRecruit && (
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => retryApplicationRun(view.applicationId), "Retried.")}>
            Retry
          </button>
        )}
      </div>

      {!d && !view.canPropose && (
        <p className="admin-hint u-m-0">
          {view.mode === "shadow"
            ? "The hiring chain is in shadow, so a hire or a rejection is still set by hand."
            : "A decision can be proposed once the application is at triage or interviewing, with nothing else waiting on its approver."}
        </p>
      )}

      {!d && view.canPropose && canRecruit && (
        <div className="u-stack u-gap-3">
          <p className="admin-hint u-m-0">No decision is proposed. Propose drafts the message with it, and one approval covers both.</p>
          <div className="u-row u-wrap u-gap-2" role="group" aria-label="Outcome">
            {OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={outcome === o.value}
                className={`admin-btn admin-btn--sm${outcome === o.value ? " admin-btn--primary" : ""}`}
                onClick={() => setOutcome(o.value)}
              >
                {o.label} · {o.tier}
              </button>
            ))}
          </div>
          <label className="admin-field u-m-0">
            <span className="admin-label">Reason (kept on the record; never in the message)</span>
            <textarea className="admin-textarea" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="admin-approval-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => proposeApplicationDecision(view.applicationId, { outcome, reason }), "Proposed. It waits on the Hiring approver.")}>
              Propose
            </button>
          </div>
        </div>
      )}

      {d && (
        <div className="admin-card admin-card--attention u-p-4 u-stack u-gap-3">
          <div className="admin-approval-eyebrow">
            <span className="admin-approval-subject">{hire ? "Hiring · Hire a candidate" : "Hiring · Reject a candidate"}</span>
            <Badge tone={hire ? "warn" : "info"}>{hire ? "Tier 2 · commitment" : "Tier 1 · one candidate"}</Badge>
            <Badge tone={waiting ? "warn" : "neutral"}>{waiting ? "Waits on approval" : d.state}</Badge>
          </div>
          <p className="admin-approval-meta u-m-0">
            {hire ? "Hire" : "Reject"} <strong>{candidateName}</strong> for {role}
            {d.reason ? `. Reason: ${d.reason.replace(/[.\s]+$/, "")}` : ""}. One approval covers the decision and the message below.
          </p>
          {d.message && (
            <div className="u-stack u-gap-1">
              <div className="u-sm"><strong>To</strong> {d.message.toEmail} · <strong>Subject</strong> {d.message.subject}</div>
              <div className="admin-card u-p-3 u-prewrap u-sm">{d.message.body}</div>
            </div>
          )}
          {waiting && d.current !== null && d.version !== d.current && (
            <div className="admin-alert admin-alert--warn">The decision or its message changed since the approval was asked for; approving asks again for the version shown.</div>
          )}
          {selfHire && <p className="admin-hint u-m-0">You proposed this hire, so it is not in your approvals: it waits on another holder of Hiring approver. Nothing is written until they decide.</p>}
          {waiting && (
            <div className="admin-approval-actions">
              {canApprove && !selfHire && d.current && (
                <>
                  <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => approveApplicationDecision(view.applicationId, d.current as string), hire ? "Hired. The message goes once." : "Rejected. The message goes once.")}>
                    {hire ? "Approve the hire" : "Approve the rejection"}
                  </button>
                  <input className="admin-input u-flex-1" aria-label="Reason, if you reject the proposal" placeholder="Reason, if you reject the proposal" value={rejectWhy} maxLength={500} onChange={(e) => setRejectWhy(e.target.value)} />
                  <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => rejectApplicationDecision(view.applicationId, rejectWhy.trim() || null), "The proposal was rejected. Nothing was written or sent.")}>
                    Reject the proposal
                  </button>
                </>
              )}
              {d.proposedByMe && canRecruit && (
                <button type="button" className="admin-btn admin-btn--ghost" disabled={pending} onClick={() => run(() => withdrawApplicationDecision(view.applicationId), "Withdrawn.")}>
                  Withdraw proposal
                </button>
              )}
              {!canApprove && !d.proposedByMe && <p className="admin-hint u-m-0">Waits on a holder of Hiring approver.</p>}
            </div>
          )}
        </div>
      )}

      {note && <div className={`admin-alert admin-alert--${note.tone === "ok" ? "ok" : "err"} u-mt-3`} role="status">{note.text}</div>}
    </section>
  );
}
