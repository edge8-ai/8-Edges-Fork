"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { useChainAction } from "@/entities/hiring/ui/useChainAction";
import { askToOpenRequisition, proposeShortlistNow, retryRequisitionRun } from "@/entities/hiring/lib/chain/actions";
import { approveRequisitionOpening, rejectRequisitionOpening } from "@/entities/hiring/lib/chain/approve-actions";
import type { RequisitionChainView } from "@/entities/hiring/lib/chain/view";
import type { MayProp } from "@/kernel/identity/may-prop";

// The requisition's place in the hiring chain (Z.9, ShortlistAfter): where
// the chain is, what the recruiter may start (Ask to open, Propose
// shortlist), and the opening approval for whoever holds Hiring approver.

const MODE_NOTE: Record<RequisitionChainView["mode"], string | null> = {
  live: null,
  paused: "The hiring chain is off on Settings → Agents: the driver waits, and these buttons still run.",
  shadow: "The hiring chain is in shadow on Settings → Agents: it proposes and drafts, and asks, sends and moves nothing. The requisition opens without an approval, as before.",
};

function stripIndex(v: RequisitionChainView): number {
  if (v.step === "collecting") return 1;
  if (v.step === "shortlist" || v.step === "shortlist-ready" || v.step === "apply-shortlist") return 2;
  if (v.status === "open") return 1;
  return 0;
}

export function RequisitionChainBar({ view, may }: { view: RequisitionChainView; may: MayProp }) {
  const canApprove = may["hiring.approve"] === true;
  const canRecruit = may["hiring.ats"] === true;
  const { pending, note, run } = useChainAction();
  const [reason, setReason] = useState("");
  const now = stripIndex(view);
  const round = view.shortlist?.round ?? 0;
  const steps = [
    { label: view.status === "draft" ? "Opening" : "Opened", sub: view.status === "draft" ? (view.step === "open-ready" ? "waits on approval" : "draft") : view.opening?.state === "approved" ? "approved" : null },
    { label: "Collecting", sub: `${view.counts.applied} applied` },
    { label: round > 0 ? `Shortlist, round ${round}` : "Shortlist", sub: view.waiting > 0 ? `${view.waiting} waiting` : null },
    { label: "Interviews", sub: view.counts.interviewing > 0 ? `${view.counts.interviewing} interviewing` : null },
    { label: "Decisions", sub: view.counts.decided > 0 ? `${view.counts.decided} decided` : null },
  ];
  const opening = view.step === "open-ready" && view.opening?.state === "pending" ? view.opening : null;
  const stale = opening && opening.version !== view.currentVersion;
  const canAskOpen = canRecruit && view.mode !== "shadow" && view.status === "draft" && (view.step === null || view.step === "closed");
  const canShortlist = canRecruit && view.status === "open" && (view.step === null || view.step === "collecting") && !view.error;

  return (
    <section className="admin-card admin-section-card u-mb-5" aria-label="Hiring chain">
      <div className="u-row u-between u-wrap u-gap-2 u-mb-3">
        <div className="admin-section-label">Hiring chain</div>
        <div className="u-row u-wrap u-gap-2">
          {view.mode === "shadow" && <Badge tone="warn">Shadow</Badge>}
          {canAskOpen && (
            <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={pending} onClick={() => run(() => askToOpenRequisition(view.requisitionId), "Asked to open. It waits on the Hiring approver.")}>
              Ask to open
            </button>
          )}
          {canShortlist && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => proposeShortlistNow(view.requisitionId), "Shortlist proposed.")}>
              Propose shortlist
            </button>
          )}
          {view.error && canRecruit && (
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => retryRequisitionRun(view.requisitionId), "Retried.")}>
              Retry
            </button>
          )}
        </div>
      </div>

      <ol className="admin-record-pipe u-m-0 u-list-plain" aria-label="Where the hiring chain is">
        {steps.map((s, i) => {
          const state = i < now ? "done" : i === now ? "now" : "todo";
          return (
            <li key={s.label} className={`admin-record-step admin-record-step--${state}`} aria-current={i === now ? "step" : undefined}>
              <span className="u-row u-gap-2 u-min-0">
                <span className="admin-record-step-node">{state === "done" ? "✓" : i + 1}</span>
                <span className="admin-record-step-label">
                  {s.label}
                  {s.sub && <span className="admin-record-step-sub">{s.sub}</span>}
                </span>
              </span>
              {i < steps.length - 1 && <span className="admin-record-step-bar" />}
            </li>
          );
        })}
      </ol>

      {MODE_NOTE[view.mode] && <p className="admin-hint u-m-0 u-mb-3">{MODE_NOTE[view.mode]}</p>}
      {view.error && <div className="admin-alert admin-alert--err u-mb-3">The chain stopped here: {view.error}</div>}
      {view.step === null && view.opening?.state === "rejected" && (
        <div className="admin-alert admin-alert--warn u-mb-3">
          Opening was rejected{view.opening.decidedAt ? ` on ${formatDate(view.opening.decidedAt)}` : ""}
          {view.opening.reason ? `: ${view.opening.reason}` : "."} The requisition stays a draft; edit it and ask again.
        </div>
      )}

      {opening && (
        <div className="admin-card admin-card--attention u-p-4 u-stack u-gap-3">
          <div className="admin-approval-eyebrow">
            <span className="admin-approval-subject">Hiring · Open a requisition</span>
            <Badge tone="warn">Tier 2</Badge>
          </div>
          <p className="admin-approval-meta u-m-0">
            Opening commits the headcount and the salary band and, if the posting is public, puts it on the careers page. Version shown <strong>{view.currentVersion}</strong>
            {stale ? `; the approval was asked for ${opening.version}, so approving asks again for the requisition as it is now.` : "."}
          </p>
          {canApprove ? (
            <div className="admin-approval-actions">
              <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => approveRequisitionOpening(view.requisitionId, view.currentVersion), "Approved and opened.")}>
                Approve and open
              </button>
              <input className="admin-input u-flex-1" aria-label="Reason, if you reject" placeholder="Reason, if you reject" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => rejectRequisitionOpening(view.requisitionId, reason.trim() || null), "Rejected.")}>
                Reject
              </button>
            </div>
          ) : (
            <p className="admin-hint u-m-0">Waits on a holder of Hiring approver.</p>
          )}
        </div>
      )}

      {note && <div className={`admin-alert admin-alert--${note.tone === "ok" ? "ok" : "err"} u-mt-3`} role="status">{note.text}</div>}
    </section>
  );
}
