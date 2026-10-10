"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signAgreementAction } from "./actions";

// The client's signature: their typed full name (shown in a script face as
// they type), their title, and a tick that they agree and may sign for their
// company. The fingerprint of the text on screen goes with it, so a signature
// on a page left open while the agreement changed is refused.
export function SignAgreementForm({
  agreementId,
  sha256,
  companyName,
  defaultName,
  defaultTitle,
}: {
  agreementId: string;
  sha256: string;
  companyName: string;
  defaultName: string;
  defaultTitle: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [title, setTitle] = useState(defaultTitle);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await signAgreementAction({ agreementId, typedName: name, title, consent, sha256Shown: sha256 });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor="sign-name">Your full name</label>
        <input id="sign-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </div>
      {name.trim() && <div className="admin-signature-name u-mb-3">{name}</div>}
      <div className="admin-field">
        <label className="admin-label" htmlFor="sign-title">Your title</label>
        <input id="sign-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="organization-title" required />
      </div>
      <label className="u-row u-gap-2 u-mb-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>I agree to this agreement and I am authorised to sign it for {companyName}.</span>
      </label>
      {error && <div className="admin-alert admin-alert--err u-mb-3">{error}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending || !consent || !name.trim() || !title.trim()}>
          {pending ? "Signing…" : "Sign"}
        </button>
      </div>
    </form>
  );
}
