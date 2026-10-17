"use client";

import { useState } from "react";
import type { prepareAgreementAction } from "./actions";
import { AGREEMENT_FILE_ACCEPT, readPickedFile, type PickedFile } from "./agreement-file";

// The deal page's "Prepare agreement" form (E-signature): the agreement's
// Markdown or PDF file, its title, the client's named signer and the fee
// invoiced when they sign. The signer's name comes from their person record,
// found by the email, which must be their portal login.

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
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
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
          setFileError("Choose the agreement's file.");
          return;
        }
        onSubmit({
          type: "client",
          dealId,
          ...file,
          title,
          signer: { title: signerTitle, email: signerEmail },
          fee: { amount: Number(amount), currency, description },
        });
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-file">Agreement (Markdown or PDF)</label>
        <input
          id="agreement-file"
          type="file"
          accept={AGREEMENT_FILE_ACCEPT}
          className="admin-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFileError(null);
            setFile(null);
            if (!f) return;
            const r = await readPickedFile(f);
            if (!r.ok) return setFileError(r.error);
            setFile(r.file);
          }}
        />
        {fileError && <div className="admin-alert admin-alert--err u-mt-2">{fileError}</div>}
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-title">Title</label>
        <input id="agreement-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Master Services Agreement and SOW" required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-signer-email">Client signer&rsquo;s email (their portal login)</label>
        <input id="agreement-signer-email" type="email" className="admin-input" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} required />
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor="agreement-signer-title">Client signer&rsquo;s title</label>
        <input id="agreement-signer-title" className="admin-input" value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} required />
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
