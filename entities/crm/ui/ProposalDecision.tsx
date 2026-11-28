"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { approveProposalAction, rejectProposalAction } from "@/entities/crm/lib/proposal-decide-actions";
import { stopProposalRun } from "@/entities/crm/lib/proposal-run-actions";
import { STEP_WORDS, type ProposalStep } from "@/entities/crm/lib/proposal-types";

// The decision card on the proposal review page (Z.10): the version the
// approver would approve, where it goes, what it is worth, and Approve and
// publish or Reject with a reason. Only the Revenue approver sees the two
// buttons (crm.proposal-approve); everyone else reads why they cannot decide.
// Stop is crm.calls', for a run nobody should finish.

export type DecisionFacts = { label: string; value: string }[];

type Props = {
  id: string;
  step: ProposalStep;
  mode: "live" | "shadow";
  version: string | null;
  pendingVersion: string | null;
  publishedUrl: string | null;
  facts: DecisionFacts;
  may: MayProp;
};

type Res = { ok: true; note?: string } | { ok: false; error: string };

export function ProposalDecision({ id, step, mode, version, pendingVersion, publishedUrl, facts, may }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const approver = may["crm.proposal-approve"] === true;
  const waiting = step === "ready" && mode === "live";
  const stoppable = ["gather", "extract", "draft", "ask", "ready", "publish"].includes(step) && may["crm.calls"] === true;
  const reasked = waiting && pendingVersion !== null && version !== null && pendingVersion !== version;

  function act(fn: () => Promise<Res>) {
    setErr(null);
    setNote(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setNote(res.note ?? null);
        setRejecting(false);
        router.refresh();
      } else setErr(res.error);
    });
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="u-row u-between u-items-center u-wrap u-gap-2">
        <div className="admin-card-title admin-card-title--compact">Proposal · Publish</div>
        {mode === "shadow" ? <Badge tone="info">Shadow</Badge> : <Badge tone="pink">Tier 2 · commitment</Badge>}
      </div>
      <dl className="admin-kv u-mt-3">
        {facts.map((f) => (
          <div key={f.label} className="u-contents">
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>

      {err && <div className="admin-alert admin-alert--err u-mt-3">{err}</div>}
      {note && <div className="admin-alert admin-alert--ok u-mt-3">{note}</div>}
      {reasked && <div className="admin-alert admin-alert--info u-mt-3">The proposal changed, so the approval was asked again for version {version}. Read it again, then decide.</div>}

      {mode === "shadow" && (
        <p className="admin-cell-muted u-sm u-mt-3">A shadow draft is never sent for approval. It is read beside the proposal made by hand for the same call.</p>
      )}

      {waiting && approver && !rejecting && (
        <div className="admin-form-actions u-mt-3">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !version} onClick={() => act(() => approveProposalAction(id, version ?? ""))}>
            {pending ? "Working…" : "Approve and publish"}
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      )}

      {waiting && approver && rejecting && (
        <div className="admin-form u-mt-3">
          <div className="admin-field">
            <label className="admin-label" htmlFor={`reject-${id}`}>
              Why (kept on the approval, optional)
            </label>
            <textarea id={`reject-${id}`} className="admin-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--danger" disabled={pending} onClick={() => act(() => rejectProposalAction(id, reason))}>
              Reject the proposal
            </button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {waiting && !approver && (
        <p className="admin-cell-muted u-sm u-mt-3">Only the Revenue approver can approve or reject a priced proposal. You can edit it and apply the CRM changes.</p>
      )}

      {!waiting && mode === "live" && (
        <p className="admin-cell-muted u-sm u-mt-3">
          {step === "done" ? (
            <>
              Approved and published.{" "}
              {publishedUrl && (
                <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
                  Open the live proposal
                </a>
              )}
            </>
          ) : step === "rejected" ? (
            "Rejected. Nothing was published and the portal shows nothing."
          ) : step === "publish" || step === "record" ? (
            `Approved; ${STEP_WORDS[step].toLowerCase()}.`
          ) : step === "stopped" ? (
            "Stopped. Nothing was published."
          ) : (
            `${STEP_WORDS[step]}. The decision opens once the draft is ready.`
          )}
        </p>
      )}

      {stoppable && (
        <div className="u-mt-3">
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => act(() => stopProposalRun(id).then((r) => (r.ok ? { ok: true as const, note: "Stopped. Any pending approval was withdrawn." } : r)))}>
            Stop this run
          </button>
        </div>
      )}
    </div>
  );
}
