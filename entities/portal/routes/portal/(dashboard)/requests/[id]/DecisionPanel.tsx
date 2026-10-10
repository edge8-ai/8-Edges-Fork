"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addScope, cancelRequest, decideEstimate, decideWork } from "../actions";
import type { WorkRequestStatus } from "@/entities/company-os";

// Status-driven decision panel for the client (admin RequestsShelf pattern):
// estimate review, work review, and a pre-approval cancel. Every decision can
// carry a note to the contractor; non-approvals require one.
function DecisionAction({
  label,
  primary,
  requireNote,
  placeholder,
  onConfirm,
}: {
  label: string;
  primary?: boolean;
  requireNote?: boolean;
  placeholder: string;
  onConfirm: (note: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [openNote, setOpenNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await onConfirm(note);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpenNote(false);
      setNote("");
      router.refresh();
    });
  }

  if (!openNote) {
    return (
      <button type="button" className={primary ? "admin-btn admin-btn--primary" : "admin-btn"} onClick={() => setOpenNote(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="u-stack u-w-full">
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} autoFocus />
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="u-row">
        <button
          type="button"
          className={primary ? "admin-btn admin-btn--primary" : "admin-btn"}
          onClick={run}
          disabled={pending || (requireNote && !note.trim())}
        >
          {pending ? "Working…" : `Confirm ${label.toLowerCase()}`}
        </button>
        <button type="button" className="admin-btn" onClick={() => setOpenNote(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const CANCELLABLE: WorkRequestStatus[] = ["awaiting_estimate", "estimate_submitted", "changes_requested"];

const STATUS_NOTE: Partial<Record<WorkRequestStatus, string>> = {
  awaiting_estimate: "Waiting on the contractor's estimate — you'll get an email when it's ready.",
  changes_requested: "The contractor is updating their estimate — you'll get an email when it's ready.",
  approved: "Estimate approved — work is underway. Need more done? Add scope below and the contractor will re-estimate.",
  scope_added: "Your added scope was sent to the contractor to re-estimate — you'll get the updated estimate to approve.",
  completed: "Work accepted. Your invoice arrives by email from QuickBooks.",
  rejected: "You declined this request — nothing further happens.",
  cancelled: "This request was cancelled.",
};

export function DecisionPanel({ id, status }: { id: string; status: WorkRequestStatus }) {
  const decidable = status === "estimate_submitted" || status === "work_submitted";
  const addable = status === "approved";
  const cancellable = CANCELLABLE.includes(status);
  const note = STATUS_NOTE[status];

  if (!decidable && !addable && !cancellable && !note) return null;

  return (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title u-mb-3">
        {status === "estimate_submitted"
          ? "Your decision — approve this estimate?"
          : status === "work_submitted"
            ? "Your decision — accept the delivered work?"
            : status === "approved"
              ? "Need more done?"
              : "Status"}
      </h2>
      {note && <p className="admin-page-sub u-mt-0">{note}</p>}
      <div className="u-row u-wrap">
        {status === "estimate_submitted" && (
          <>
            <DecisionAction
              label="Approve estimate"
              primary
              placeholder="Optional note to the contractor"
              onConfirm={(n) => decideEstimate(id, "approved", n)}
            />
            <DecisionAction
              label="Request changes"
              requireNote
              placeholder="What should change? (sent to the contractor)"
              onConfirm={(n) => decideEstimate(id, "changes_requested", n)}
            />
            <DecisionAction
              label="Decline"
              requireNote
              placeholder="Why is this not going ahead? (sent to the contractor)"
              onConfirm={(n) => decideEstimate(id, "rejected", n)}
            />
          </>
        )}
        {status === "work_submitted" && (
          <>
            <DecisionAction
              label="Accept work"
              primary
              placeholder="Optional note to the contractor"
              onConfirm={(n) => decideWork(id, "accepted", n)}
            />
            <DecisionAction
              label="Request revision"
              requireNote
              placeholder="What needs revising? (sent to the contractor)"
              onConfirm={(n) => decideWork(id, "revision", n)}
            />
          </>
        )}
        {addable && (
          <DecisionAction
            label="Add scope"
            primary
            requireNote
            placeholder="Describe the extra work you need — the contractor will re-estimate it"
            onConfirm={(n) => addScope(id, n)}
          />
        )}
        {cancellable && (
          <DecisionAction
            label="Cancel request"
            placeholder="Optional reason (sent to the contractor)"
            onConfirm={(n) => cancelRequest(id, n)}
          />
        )}
      </div>
      {addable && (
        <p className="admin-cell-muted u-mt-3 u-mb-0 u-sm">
          Adding scope sends the request back to the contractor for an updated estimate. Nothing extra is billed until
          you accept the finished work.
        </p>
      )}
      {status === "estimate_submitted" && (
        <p className="admin-cell-muted u-mt-3 u-mb-0 u-sm">
          Approving means the contractor starts the work; you&apos;ll review and accept the result before
          anything is invoiced.
        </p>
      )}
      {status === "work_submitted" && (
        <p className="admin-cell-muted u-mt-3 u-mb-0 u-sm">
          Accepting closes the project and triggers your invoice at the agreed hourly rate.
        </p>
      )}
    </div>
  );
}
