"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { useChainAction } from "@/entities/hiring/ui/useChainAction";
import { approveCandidateMessage, dontSendCandidateMessage, editCandidateMessage, settleStuckCandidateMessage } from "@/entities/hiring/lib/chain/approve-actions";
import type { ApplicationChainView, MessageView } from "@/entities/hiring/lib/chain/view";
import type { MayProp } from "@/kernel/identity/may-prop";

// Candidate messages (Z.9, MessageAfter): the invitation or decline the
// chain drafted from a template, who it goes to and where replies go, and
// the approver's three answers: Approve and send, Edit, Don't send. A
// decision's message is shown with the decision, which one approval covers.

const KIND_WORD: Record<MessageView["kind"], string> = {
  invite: "Interview invitation",
  decline: "Decline",
  decision_hire: "Hire message",
  decision_reject: "Rejection message",
};

const STATUS_WORD: Record<string, { tone: "ok" | "warn" | "err" | "info" | "neutral"; text: string }> = {
  pending: { tone: "warn", text: "Waits on approval" },
  approved: { tone: "info", text: "Approved, sending" },
  sending: { tone: "info", text: "Sending" },
  sent: { tone: "ok", text: "Sent" },
  failed: { tone: "err", text: "Not sent" },
};

function MessageItem({ m, view, canApprove }: { m: MessageView; view: ApplicationChainView; canApprove: boolean }) {
  const { pending, note, run } = useChainAction();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(m.subject);
  const [body, setBody] = useState(m.body);
  const waiting = m.status === "pending" && view.step === "message-ready";
  const stale = waiting && m.asked !== null && m.asked !== m.version;
  const status = STATUS_WORD[m.status] ?? { tone: "neutral" as const, text: m.status };

  return (
    <article className="admin-card admin-card--outlined u-p-4 u-stack u-gap-3">
      <div className="admin-approval-eyebrow">
        <span className="admin-approval-subject">Hiring · Candidate message</span>
        <Badge tone="info">Tier 1 · one candidate</Badge>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      <h3 className="admin-approval-title u-m-0">{KIND_WORD[m.kind]}</h3>
      <dl className="admin-approval-facts">
        <div className="admin-approval-fact"><dt>To</dt><dd>{m.toEmail}</dd></div>
        <div className="admin-approval-fact"><dt>Reply to</dt><dd>{view.replyTo ?? "No recruiter or hiring manager email on the requisition"}</dd></div>
        <div className="admin-approval-fact"><dt>Subject</dt><dd>{m.subject}</dd></div>
        <div className="admin-approval-fact"><dt>Version</dt><dd>{m.version}{m.edited ? " (edited by the approver)" : ""}</dd></div>
      </dl>
      {editing ? (
        <div className="u-stack u-gap-2">
          <label className="admin-field u-m-0">
            <span className="admin-label">Subject</span>
            <input className="admin-input" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="admin-field u-m-0">
            <span className="admin-label">Message</span>
            <textarea className="admin-textarea" rows={10} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="admin-approval-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => editCandidateMessage(m.id, { subject, body }), "Saved. The approval was asked again.", () => setEditing(false))}>
              Save edit
            </button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-card u-p-3 u-prewrap u-sm">{m.body}</div>
      )}
      {stale && <div className="admin-alert admin-alert--warn">The message changed since its approval was asked for; approving asks again for version {m.version}.</div>}
      {waiting && !editing && canApprove && (
        <div className="admin-approval-actions">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => approveCandidateMessage(m.id, m.version), "Approved and sent once.")}>
            Approve and send
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="admin-btn admin-btn--ghost" disabled={pending} onClick={() => run(() => dontSendCandidateMessage(m.id, null), "Not sent.")}>
            Don&apos;t send
          </button>
        </div>
      )}
      {waiting && !canApprove && <p className="admin-hint u-m-0">Waits on a holder of Hiring approver.</p>}
      {m.status === "sending" && view.error && canApprove && (
        <div className="admin-approval-actions">
          <span className="admin-hint">Check the sent mail, then say whether it went:</span>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => settleStuckCandidateMessage(m.id, "sent"), "Marked sent.")}>
            It was sent
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => settleStuckCandidateMessage(m.id, "resend"), "Sending again.")}>
            Send it again
          </button>
        </div>
      )}
      {m.status === "sent" && (
        <p className="admin-hint u-m-0">
          Sent once{m.sentAt ? ` on ${formatDate(m.sentAt)}` : ""}, version {m.version}, under its send key. A second click, a retry or the next tick finds the key taken and sends nothing.
        </p>
      )}
      {note && <div className={`admin-alert admin-alert--${note.tone === "ok" ? "ok" : "err"}`} role="status">{note.text}</div>}
    </article>
  );
}

export function CandidateMessagesCard({ view, may }: { view: ApplicationChainView; may: MayProp }) {
  const canApprove = may["hiring.approve"] === true;
  const shown = view.messages.filter((m) => m.kind === "invite" || m.kind === "decline" || m.status === "sent" || m.status === "sending");
  return (
    <section className="admin-card admin-section-card" aria-label="Candidate messages">
      <div className="admin-section-label u-mb-2">Candidate messages</div>
      <p className="admin-hint u-m-0 u-mb-3">
        Hiring chain: <strong>{view.stepLine}</strong>. Every message is drafted from a template, read and approved by a person, and sent once.
      </p>
      <p className="admin-hint u-m-0 u-mb-3">
        Screening flags:{" "}
        {view.flags.length === 0
          ? "none found."
          : view.flags.map((f) => `${f.kind.replace(/-/g, " ")}${f.quote ? ` (“${f.quote}”)` : ""}`).join("; ")}{" "}
        Nothing the model wrote is in any message.
      </p>
      {view.mode === "shadow" && <div className="admin-alert admin-alert--warn u-mb-3">The hiring chain is in shadow: nothing is asked or sent from this page.</div>}
      {view.error && <div className="admin-alert admin-alert--err u-mb-3">The chain stopped here: {view.error}</div>}
      {shown.length === 0 ? (
        <div className="admin-empty">No message has been drafted for this candidate.</div>
      ) : (
        <div className="u-stack u-gap-3">
          {shown.map((m) => (
            <MessageItem key={m.id} m={m} view={view} canApprove={canApprove} />
          ))}
        </div>
      )}
    </section>
  );
}
