"use client";

import { useState } from "react";
import { formatDate } from "@/kernel/ui/format";
import type { AgreementView } from "./agreement-view";

// The pieces of one agreement on AgreementCard: its facts as label and value
// rows, and the form Edge8 signs it with.

export function AgreementDetails({ a }: { a: AgreementView }) {
  return (
    <dl className="admin-kv u-mt-2">
      <dt>Signer</dt>
      <dd>
        {a.signer.name}, {a.signer.title} · {a.signer.email}
      </dd>
      {a.fee && (
        <>
          <dt>Fee</dt>
          <dd>
            {a.fee}
            {a.feeDescription ? ` · ${a.feeDescription}` : ""}
          </dd>
        </>
      )}
      <dt>Prepared</dt>
      <dd>{formatDate(a.preparedAt)}</dd>
      <dt>Edge8</dt>
      <dd>{a.edge8 ? `Signed by ${a.edge8.name}, ${a.edge8.title}, ${formatDate(a.edge8.signedAt)}` : "Not signed yet"}</dd>
      {a.sentAt && (
        <>
          <dt>Sent</dt>
          <dd>{formatDate(a.sentAt)}</dd>
        </>
      )}
      {a.client && (
        <>
          <dt>{a.typeLabel}</dt>
          <dd>
            Signed by {a.client.name}, {a.client.title}, {formatDate(a.client.signedAt)}
          </dd>
        </>
      )}
      {(a.signedCopyUrl || a.pdfUrl) && (
        <>
          <dt>Documents</dt>
          <dd>
            {a.pdfUrl && (
              <>
                <a href={a.pdfUrl}>Agreement (PDF)</a>
                {a.signedCopyUrl ? " · " : ""}
              </>
            )}
            {a.signedCopyUrl && <a href={a.signedCopyUrl}>{a.pdfUrl ? "Signing record" : "Signed copy"}</a>}
          </dd>
        </>
      )}
      {a.invoice && (
        <>
          <dt>Invoice</dt>
          <dd>{a.invoice}</dd>
        </>
      )}
      <dt>Fingerprint</dt>
      <dd className="admin-fingerprint">SHA-256 {a.sha256}</dd>
    </dl>
  );
}

export function SignForm({
  pending,
  defaults,
  onSign,
  onCancel,
}: {
  pending: boolean;
  defaults: { name: string; title: string } | null;
  onSign: (name: string, title: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [title, setTitle] = useState(defaults?.title ?? "");
  return (
    <form
      className="admin-form u-mt-3 u-max-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSign(name, title);
      }}
    >
      <div className="u-grid-2">
        <div className="admin-field">
          <label className="admin-label" htmlFor="edge8-sign-name">Your full name</label>
          <input id="edge8-sign-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="edge8-sign-title">Your title</label>
          <input id="edge8-sign-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
      </div>
      {name.trim() && <div className="admin-signature-name">{name}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending || !name.trim() || !title.trim()}>
          Sign for Edge8
        </button>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
