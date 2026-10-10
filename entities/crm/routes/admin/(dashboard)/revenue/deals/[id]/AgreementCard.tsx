"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { AgreementStatus } from "@/entities/crm/lib/agreements";
import {
  prepareAgreementAction,
  retryInvoiceAction,
  sendAgreementAction,
  signForEdge8Action,
  voidAgreementAction,
} from "../agreement-actions";
import type { AgreementView } from "./agreement-view";
import { PrepareAgreementForm } from "./PrepareAgreementForm";

// The agreements on this deal (E-signature): prepare one from a Markdown file,
// read and sign it for Edge8, send it to the client's named signer, and follow
// it to the signed copy and its invoice. Edge8 signs first, so Send only
// appears once Edge8's signature is on it. Only a Super Admin gets the buttons.

const TONE: Record<AgreementStatus, BadgeTone> = {
  draft: "warn",
  edge8_signed: "info",
  sent: "info",
  signed: "ok",
  void: "neutral",
};

export function AgreementCard({
  dealId,
  dealCurrency,
  agreements,
  canManage,
}: {
  dealId: string;
  dealCurrency: string | null;
  agreements: AgreementView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done?: string) {
    setError(null);
    setNotice(null);
    start(async () => {
      const r = await action();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (done) setNotice(done);
      router.refresh();
    });
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head">
        <div className="admin-kpi-label">Agreements</div>
        {canManage && !preparing && (
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => setPreparing(true)}>
            Prepare agreement
          </button>
        )}
      </div>
      {error && <div className="admin-alert admin-alert--err u-mb-2">{error}</div>}
      {notice && <div className="admin-alert u-mb-2">{notice}</div>}
      {preparing && (
        <PrepareAgreementForm
          dealId={dealId}
          dealCurrency={dealCurrency}
          pending={pending}
          onCancel={() => setPreparing(false)}
          onSubmit={(input) => {
            setError(null);
            setNotice(null);
            start(async () => {
              const r = await prepareAgreementAction(input);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setPreparing(false);
              setNotice(r.warnings.length > 0 ? `Prepared. ${r.warnings.join(" ")}` : "Prepared. Read it and sign it for Edge8 below.");
              router.refresh();
            });
          }}
        />
      )}
      {agreements.length === 0 && !preparing ? (
        <div className="admin-empty">No agreements on this deal.</div>
      ) : (
        <div className="admin-list">
          {agreements.map((a) => (
            <div key={a.id} className="admin-list-row u-stack u-items-stretch">
              <div className="u-row u-gap-3 u-items-start">
                <div className="admin-list-main">
                  <div className="admin-list-title">{a.title}</div>
                  <div className="admin-list-sub">
                    For {a.signer.name}, {a.signer.title} ({a.signer.email}) · {a.fee} · prepared {formatDate(a.preparedAt)}
                    {a.sentAt ? ` · sent ${formatDate(a.sentAt)}` : ""}
                  </div>
                </div>
                <div className="admin-list-aside">
                  <Badge tone={TONE[a.status]}>{a.statusLabel}</Badge>
                </div>
              </div>

              {a.edge8 && <div className="admin-list-sub">Edge8: {a.edge8.name}, {a.edge8.title}, signed {formatDate(a.edge8.signedAt)}</div>}
              {a.client && <div className="admin-list-sub">Client: {a.client.name}, {a.client.title}, signed {formatDate(a.client.signedAt)}</div>}
              {a.signedCopyUrl && (
                <div className="admin-list-sub">
                  <a href={a.signedCopyUrl}>Download the signed copy</a>
                </div>
              )}
              {a.invoice && <div className="admin-list-sub">{a.invoice}</div>}
              {a.invoiceError && <div className="admin-alert admin-alert--err u-mt-2">Invoice not raised: {a.invoiceError}</div>}
              <div className="admin-fingerprint u-mt-2">SHA-256 {a.sha256}</div>

              {a.status === "draft" && (
                <>
                  {a.htmlError && <div className="admin-alert admin-alert--err u-mt-2">{a.htmlError}</div>}
                  {a.html && (
                    <details className="u-mt-2">
                      <summary>Read the agreement</summary>
                      <div className="admin-idea-plan admin-agreement-text u-mt-2" dangerouslySetInnerHTML={{ __html: a.html }} />
                    </details>
                  )}
                  {canManage && a.html && (
                    <SignForm pending={pending} onSign={(name, title) => run(() => signForEdge8Action({ agreementId: a.id, name, title }), "Signed for Edge8. Send it when you are ready.")} />
                  )}
                </>
              )}

              {canManage && (
                <div className="admin-form-actions u-mt-2">
                  {a.status === "edge8_signed" && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await sendAgreementAction(a.id);
                          if (r.ok && !r.emailed) return { ok: false as const, error: `Sent, but the email to ${a.signer.email} did not go. It is waiting on their portal home.` };
                          return r;
                        }, `Sent to ${a.signer.email}.`)
                      }
                    >
                      Send to {a.signer.name}
                    </button>
                  )}
                  {a.canRetryInvoice && (
                    <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => run(() => retryInvoiceAction(a.id), "Invoice raised.")}>
                      Retry invoice
                    </button>
                  )}
                  {(a.status === "draft" || a.status === "edge8_signed" || a.status === "sent") && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--ghost"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Void ${a.title}? ${a.signer.name} will no longer be able to sign it.`)) run(() => voidAgreementAction(a.id), "Voided.");
                      }}
                    >
                      Void
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignForm({ pending, onSign }: { pending: boolean; onSign: (name: string, title: string) => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  return (
    <form
      className="admin-form u-mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSign(name, title);
      }}
    >
      <div className="admin-field">
        <label className="admin-label" htmlFor="edge8-sign-name">Your full name</label>
        <input id="edge8-sign-name" className="admin-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      {name.trim() && <div className="admin-signature-name">{name}</div>}
      <div className="admin-field">
        <label className="admin-label" htmlFor="edge8-sign-title">Your title</label>
        <input id="edge8-sign-title" className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending || !name.trim() || !title.trim()}>
          Sign for Edge8
        </button>
      </div>
    </form>
  );
}
