"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import { draftProposalForMeeting, retryProposal, setMeetingSalesCall } from "@/entities/crm/lib/proposal-run-actions";
import { PROGRESS_STEPS, STEP_WORDS, type ProposalStep } from "@/entities/crm/lib/proposal-types";
import type { PanelRun } from "@/entities/crm/lib/proposal-view";

// The meeting page's Proposal panel (Z.10): where the chain is for this call,
// a link to the review page, Draft a proposal when no run exists, Retry when
// one stopped, and the Sales call toggle that lets the chain find the meeting
// on its own. Every control is hidden from a viewer whose crm.calls the
// action would refuse.

const RUNNING: readonly ProposalStep[] = ["gather", "extract", "draft", "ask", "publish", "record"];
const ORDER: readonly ProposalStep[] = ["gather", "extract", "draft", "ask", "ready", "publish", "record", "done"];

function badgeFor(run: PanelRun | null): { tone: "ok" | "warn" | "err" | "info" | "neutral"; label: string } {
  if (!run) return { tone: "neutral", label: "No proposal" };
  if (run.mode === "shadow" && run.step === "shadow-done") return { tone: "info", label: "Shadow draft" };
  if (run.step === "done") return { tone: "ok", label: "Published" };
  if (run.step === "stopped") return { tone: "err", label: "Stopped" };
  if (run.step === "rejected") return { tone: "neutral", label: "Rejected" };
  if (run.step === "ready") return { tone: "warn", label: "Waiting on approval" };
  return { tone: "info", label: run.mode === "shadow" ? "Shadow · drafting" : "Drafting" };
}

function Progress({ step }: { step: ProposalStep }) {
  const at = ORDER.indexOf(step);
  return (
    <div className="u-row u-wrap u-gap-2 u-mt-2" aria-label="Proposal steps">
      {PROGRESS_STEPS.map((p) => {
        const idx = ORDER.indexOf(p.step);
        const tone = idx < at || step === "done" ? "ok" : idx === at || (p.step === "ready" && step === "ask") ? "info" : "neutral";
        return (
          <Badge key={p.step} tone={tone} dot={tone === "info"}>
            {p.label}
          </Badge>
        );
      })}
    </div>
  );
}

export function MeetingProposalPanel({ meetingId, isSales, summaryReady, run, may }: { meetingId: string; isSales: boolean; summaryReady: boolean; run: PanelRun | null; may: MayProp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const canRun = may["crm.calls"] === true;
  const badge = badgeFor(run);
  const review = run ? `/admin/revenue/proposals/${run.id}` : null;

  function act(fn: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>) {
    setErr(null);
    setNote(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setNote(res.note ?? null);
        router.refresh();
      } else setErr(res.error);
    });
  }

  return (
    <div className="admin-card admin-section-card u-mt-4">
      <div className="u-row u-between u-items-center u-wrap u-gap-2">
        <div className="u-row u-items-center u-gap-2">
          <div className="admin-shelf-heading u-mb-0">Proposal</div>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        {canRun && (
          <label className="u-row u-items-center u-gap-1 u-sm">
            <input type="checkbox" checked={isSales} disabled={pending} onChange={(e) => act(() => setMeetingSalesCall(meetingId, e.target.checked))} />
            Sales call
          </label>
        )}
      </div>

      {err && <div className="admin-alert admin-alert--err u-mt-2">{err}</div>}
      {note && <div className="admin-alert admin-alert--info u-mt-2">{note}</div>}

      {!run && (
        <div className="u-mt-2">
          <p className="admin-cell-muted u-sm u-mb-2">
            {isSales
              ? "Marked as a sales call. The proposal chain picks it up at its next tick, within five minutes, once the summary is ready."
              : "No proposal yet. This meeting is not marked as a sales call, so the chain leaves it alone. Draft one if this call asked for a proposal."}
          </p>
          {canRun && (
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !summaryReady} onClick={() => act(() => draftProposalForMeeting(meetingId))}>
              {pending ? "Starting…" : "Draft a proposal"}
            </button>
          )}
          {canRun && !summaryReady && <p className="admin-cell-muted u-xs u-mt-1">The chain drafts from the summary, so it waits until the summary is ready.</p>}
        </div>
      )}

      {run && RUNNING.includes(run.step) && (
        <>
          <Progress step={run.step} />
          <p className="admin-cell-muted u-sm u-mt-2">
            {STEP_WORDS[run.step]}. Each step runs once per tick and shows on Settings → Agents.
            {run.mode === "shadow" ? " This is a shadow run: it stops after the draft and sends nothing." : ""}
          </p>
        </>
      )}

      {run?.step === "ready" && (
        <>
          <Progress step={run.step} />
          <p className="admin-cell-muted u-sm u-mt-2">
            Waiting on the Revenue approver{run.version ? `, version ${run.version}` : ""}. Nothing reaches the client until it is approved, and it is never approved on a timeout.
          </p>
        </>
      )}

      {run?.step === "done" && (
        <p className="admin-cell-muted u-sm u-mt-2">
          Published and listed in the client&apos;s portal.{" "}
          {run.publishedUrl && (
            <a href={run.publishedUrl} target="_blank" rel="noopener noreferrer">
              Open the live proposal
            </a>
          )}
        </p>
      )}

      {run?.step === "shadow-done" && (
        <p className="admin-cell-muted u-sm u-mt-2">
          A shadow draft: written to be compared with the proposal made by hand for this call. It was not sent for approval, and nothing was published or changed in the CRM.
        </p>
      )}

      {run?.step === "rejected" && <p className="admin-cell-muted u-sm u-mt-2">Rejected by the Revenue approver. Nothing was published.</p>}

      {run?.step === "stopped" && (
        <div className="admin-alert admin-alert--warn u-mt-2">
          <strong>Stopped.</strong> {run.error ?? "No reason was recorded."}
          {/nothing was/i.test(run.error ?? "") ? "" : " Nothing was sent or published."}
        </div>
      )}

      {run && (
        <div className="u-row u-wrap u-gap-2 u-mt-3">
          {review && (
            <Link className="admin-btn" href={review}>
              {run.step === "ready" ? "Review the proposal" : run.step === "shadow-done" ? "Read the shadow draft" : "Open the proposal"}
            </Link>
          )}
          {canRun && ["stopped", "rejected", "shadow-done"].includes(run.step) && (
            <button type="button" className="admin-btn" disabled={pending} onClick={() => act(() => retryProposal(run.id))}>
              {run.step === "stopped" ? "Retry" : "Draft again"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
