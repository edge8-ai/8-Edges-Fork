"use client";

import { useState } from "react";
import type { prepareAgreementAction } from "../agreement-actions";

// The deal page's "Prepare agreement" form (E-signature): the agreement's
// Markdown file, its title, the client's named signer and the fee invoiced
// when they sign. Only a Markdown file can be prepared, because the portal
// renders it as sanitised text and pins its exact bytes by fingerprint.

type PrepareInput = Parameters<typeof prepareAgreementAction>[0];

export function PrepareAgreementForm({
  dealId,
  dealCurrency,
  pending,
  onCancel,
  onSubmit,
}: {
  dealId: string;
  dealCurrency: string | null;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: PrepareInput) => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState((dealCurrency ?? "usd").toUpperCase());
  const [description, setDescription] = useState("");

  return (
    <form
      className="admin-form u-mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) {
          setFileError("Choose the agreement's Markdown file.");
          return;
        }
        onSubmit({
          dealId,
          markdown: file.text,
          filename: file.name,
          title,
          signer: { name: signerName, title: signerTitle, email: signerEmail },
          fee: { amount: Number(amount), currency, description },
        });
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-file">Agreement (Markdown, .md)</label>
        <input
          id="agreement-file"
          type="file"
          accept=".md,text/markdown"
          className="admin-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFileError(null);
            if (!f) return setFile(null);
            if (!f.name.toLowerCase().endsWith(".md")) {
              setFile(null);
              setFileError("Only a Markdown (.md) file can be prepared for signing.");
              return;
            }
            setFile({ name: f.name, text: await f.text() });
          }}
        />
        {fileError && <div className="admin-alert admin-alert--err u-mt-2">{fileError}</div>}
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-title">Title</label>
        <input id="agreement-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Master Services Agreement and SOW" required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-signer-name">Client signer&rsquo;s full name</label>
        <input id="agreement-signer-name" className="admin-input" value={signerName} onChange={(e) => setSignerName(e.target.value)} required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-signer-title">Client signer&rsquo;s title</label>
        <input id="agreement-signer-title" className="admin-input" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-signer-email">Client signer&rsquo;s email (their portal login)</label>
        <input id="agreement-signer-email" type="email" className="admin-input" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-fee">Fee invoiced on signature</label>
        <div className="u-row u-gap-2">
          <input id="agreement-fee" type="number" min="0" step="0.01" className="admin-input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <input aria-label="Currency" className="admin-input admin-input--w-sm" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} required />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-fee-description">Invoice line</label>
        <input id="agreement-fee-description" className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Foundation, per the signed SOW" required />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending}>
          Prepare
        </button>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
