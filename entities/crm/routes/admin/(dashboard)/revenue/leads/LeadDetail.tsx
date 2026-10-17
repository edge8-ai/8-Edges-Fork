"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import { NOT_STATED } from "@/entities/crm/lib/inquiry-triage-shapes";
import {
  bookMeetingAndHandOff,
  deleteLeadPerson,
  disqualifyLead,
  logCall,
  markConnected,
  removeFromQueue,
  saveQualification,
} from "./actions";
import type { QueueRow } from "./lead-queue-types";
import { QualifierRead } from "./QualifierRead";

// The open card of the SDR queue: the inquiry, the qualifier's read of it
// (Z.11), the qualification answers, and the moves that work the lead.

const DISQUALIFY_REASONS = [
  ["no_budget", "No budget"],
  ["no_need", "No need"],
  ["bad_timing", "Bad timing"],
  ["no_authority", "No authority"],
  ["unresponsive", "Unresponsive"],
  ["competitor", "Chose competitor"],
  ["not_icp", "Not our ICP"],
  ["other", "Other"],
] as const;

const GPCT_FIELDS = [
  ["goal", "Goal"],
  ["plan", "Plan"],
  ["challenge", "Challenge"],
  ["timeline", "Timeline"],
  ["budget", "Budget"],
  ["authority", "Authority"],
] as const;

export function LeadDetail({
  row,
  pending,
  run,
  may,
}: {
  row: QueueRow;
  pending: boolean;
  run: (a: () => Promise<{ ok: true } | { ok: false; error: string }>) => void;
  may: MayProp;
}) {
  const canWork = may["crm.pipeline"] === true;
  const router = useRouter();
  const [qual, setQual] = useState(row.qual);
  const [callNote, setCallNote] = useState("");
  const [reason, setReason] = useState("");
  const [dqNote, setDqNote] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const capturedCount = GPCT_FIELDS.filter(([k]) => qual[k].trim()).length;
  // The qualifier's suggestions stay suggestions (decision 10): Use these
  // fills only the empty inputs, and nothing is saved until Save qualification.
  const suggest = row.qualifier?.gpct ?? null;
  const offered = (k: (typeof GPCT_FIELDS)[number][0]) => (suggest && suggest[k] && suggest[k] !== NOT_STATED ? suggest[k] : null);
  const canUse = GPCT_FIELDS.some(([k]) => offered(k) && !qual[k].trim());

  return (
    <div className="admin-lead-detail">
      <div className="admin-lead-meta-row">
        <Link href={`/admin/contacts/${row.id}`} className="admin-cell-strong">
          Open contact
        </Link>
        <a className="admin-cell-muted" href={`mailto:${row.email}`}>
          {row.email}
        </a>
        {row.phone && <span className="admin-cell-muted">{row.phone}</span>}
        {row.inquiry && (
          <span className="admin-cell-muted">Inbound {formatDate(row.inquiry.createdAt)}</span>
        )}
        {row.inquiry?.teamSize && <span className="admin-cell-muted">Team {row.inquiry.teamSize}</span>}
      </div>

      {row.inquiry?.message && <p className="admin-lead-inquiry">{row.inquiry.message}</p>}

      {row.inquiry && <QualifierRead inquiryId={row.inquiry.id} read={row.qualifier} email={row.email} may={may} />}

      <div className="admin-lead-read-head">
        <span className="admin-lead-section-label">Qualification (GPCT) · {capturedCount}/6 captured</span>
        {canWork && canUse && (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setQual((q) => ({ ...q, ...Object.fromEntries(GPCT_FIELDS.map(([k]) => [k, q[k].trim() ? q[k] : (offered(k) ?? "")])) }))}>
            Use these suggestions
          </button>
        )}
      </div>
      <div className="admin-lead-gpct">
        {GPCT_FIELDS.map(([key, label]) => (
          <label key={key} className="admin-lead-field">
            <span className="admin-label">{label}</span>
            <input
              className="admin-input"
              value={qual[key]}
              placeholder="Not captured"
              onChange={(e) => setQual((q) => ({ ...q, [key]: e.target.value }))}
            />
            {offered(key) && !qual[key].trim() && <span className="admin-lead-suggestion">Suggested: {offered(key)}</span>}
          </label>
        ))}
      </div>
      {canWork && (<>
      <div className="admin-lead-actions u-mb-5">
        <button
          type="button"
          className="admin-btn"
          disabled={pending}
          onClick={() => {
            run(() => saveQualification(row.id, qual));
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
          }}
        >
          {savedFlash ? "Saved" : "Save qualification"}
        </button>
      </div>

      <div className="admin-lead-section-label">Work it</div>
      <div className="admin-lead-actions u-mb-3">
        <input
          className="admin-input admin-lead-note"
          placeholder="Call note (optional)"
          value={callNote}
          onChange={(e) => setCallNote(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn"
          disabled={pending}
          onClick={() => {
            run(() => logCall(row.id, callNote));
            setCallNote("");
          }}
        >
          Log call
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={pending || row.status === "connected"}
          onClick={() => run(() => markConnected(row.id))}
        >
          Connected
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={pending}
          onClick={() => run(() => bookMeetingAndHandOff(row.id))}
        >
          Book meeting and hand off
        </button>
      </div>

      <div className="admin-lead-actions">
        <select
          className="admin-input admin-lead-select"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Disqualify reason…</option>
          {DISQUALIFY_REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          className="admin-input admin-lead-note"
          placeholder="Note (optional)"
          value={dqNote}
          onChange={(e) => setDqNote(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn"
          disabled={pending || !reason}
          onClick={() => run(() => disqualifyLead(row.id, reason, "nurture", dqNote))}
        >
          Send to nurture
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--danger"
          disabled={pending || !reason}
          onClick={() => run(() => disqualifyLead(row.id, reason, "unqualified", dqNote))}
        >
          Disqualify
        </button>
      </div>

      <div className="admin-danger-zone u-mt-4">
        <div className="admin-danger-row">
          <span className="admin-danger-row-text">
            <strong>Remove from queue</strong> keeps the contact and their history — it just takes them
            off the SDR queue. <strong>Delete person</strong> erases the record entirely (GDPR) and is
            blocked if they have orders, bookings or deals.
          </span>
          <span className="u-row u-shrink-0">
            <button
              type="button"
              className="admin-btn"
              disabled={pending}
              onClick={() => run(() => removeFromQueue(row.id))}
            >
              Remove from queue
            </button>
            <ConfirmButton
              label="Delete person"
              title="Permanently erase this person?"
              body={
                <>
                  This erases <strong>{row.name}</strong> and their linked history under GDPR
                  right-to-erasure. This cannot be undone.
                </>
              }
              confirmLabel="Erase permanently"
              typeToConfirm={row.name}
              onConfirm={() => deleteLeadPerson(row.id)}
              onDone={() => router.refresh()}
            />
          </span>
        </div>
      </div>
      </>)}
    </div>
  );
}
