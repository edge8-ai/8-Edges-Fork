"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatVndWhole } from "@/kernel/ui/format";
import { resumableUploadToSignedPath } from "@/kernel/ui/upload";
import type { Result } from "@/kernel/data/result";

// Recording one payment (decision 4): the payer has paid this person in the
// bank, uploads that transfer's bank receipt, enters the VND actually sent,
// and marks them paid. No receipt, no Paid: the button waits for a confirmed
// upload, the action refuses without one, and so does the database. Below it,
// a transfer that failed is returned to approved with a reason the person is
// told (decision 5). The actions are the page's, handed in, because nothing
// under ui/ may import a route.

type Started = { ok: true; fileId: string; bucket: string; path: string; token: string } | { ok: false; error: string };

export type PayerActions = {
  startUpload: (paymentId: string, declared: { name: string; size: number; type: string }) => Promise<Started>;
  confirmUpload: (paymentId: string, fileId: string) => Promise<{ ok: true; filename: string } | { ok: false; error: string }>;
  record: (paymentId: string, paidVnd: number, receiptFileId: string) => Promise<Result>;
  giveBack: (paymentId: string, reason: string) => Promise<Result>;
};

export type PayablePayment = { id: string; personName: string; amountVnd: number };

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

/** Whole dong from what was typed: digits only, separators ignored; null when there are none. */
export function vndFromInput(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export function RecordPayment({
  payment,
  actions,
  onDone,
  allowReturn = true,
}: {
  payment: PayablePayment;
  actions: PayerActions;
  /** Called once the payment is recorded or returned; the page refreshes when there is none. */
  onDone?: () => void;
  allowReturn?: boolean;
}) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<{ fileId: string; filename: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [sent, setSent] = useState(payment.amountVnd.toLocaleString("en-US"));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);
  const first = payment.personName.split(" ")[0] || payment.personName;
  const paidVnd = vndFromInput(sent);
  const done = () => (onDone ? onDone() : router.refresh());

  async function upload(file: File) {
    setError(null);
    const started = await actions.startUpload(payment.id, { name: file.name, size: file.size, type: file.type });
    if (!started.ok) return setError(started.error);
    setProgress(0);
    resumableUploadToSignedPath({
      file,
      bucket: started.bucket,
      path: started.path,
      token: started.token,
      onProgress: (bytes) => setProgress(file.size > 0 ? bytes / file.size : 1),
      onError: (why) => {
        setProgress(null);
        setError(why === "refused" ? "The storage refused the file. Check its type and size." : "The upload stopped. Try again.");
      },
      onSuccess: async () => {
        const confirmed = await actions.confirmUpload(payment.id, started.fileId);
        setProgress(null);
        if (!confirmed.ok) return setError(confirmed.error);
        setReceipt({ fileId: started.fileId, filename: confirmed.filename });
      },
    });
  }

  const picked = (input: HTMLInputElement | null) => {
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (file) void upload(file);
  };

  const markPaid = () =>
    start(async () => {
      setError(null);
      if (!receipt || paidVnd === null) return;
      const res = await actions.record(payment.id, paidVnd, receipt.fileId);
      if (!res.ok) return setError(res.error);
      done();
    });

  const differs = paidVnd !== null && paidVnd !== payment.amountVnd;
  return (
    <div className="u-stack u-gap-2 u-mt-1">
      <div className="admin-field">
        <span className="admin-label">Bank receipt for {first}</span>
        <div className="u-row u-gap-1 u-wrap u-items-center">
          <span className="admin-hint">{receipt ? receipt.filename : "No receipt yet."}</span>
          <button type="button" className="admin-btn admin-btn--sm" disabled={pending || progress !== null} onClick={() => picker.current?.click()}>
            {receipt ? "Replace" : "Upload"}
          </button>
          <input ref={picker} type="file" className="u-hidden-input" accept={ACCEPT} onChange={(e) => picked(e.currentTarget)} />
        </div>
        {progress !== null && (
          <div className="admin-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="admin-progress-fill" data-p={String(Math.min(100, Math.round(progress * 10) * 10))} />
          </div>
        )}
      </div>
      <div className="admin-field">
        <label className="admin-label" htmlFor={`sent-${payment.id}`}>
          VND actually sent
        </label>
        <input id={`sent-${payment.id}`} className="admin-input u-tabular" inputMode="numeric" value={sent} onChange={(e) => setSent(e.target.value)} />
        <span className="admin-hint">
          {paidVnd === null
            ? "Enter the amount the bank sent."
            : differs
              ? `Differs from the claims' total by ${formatVndWhole(Math.abs(paidVnd - payment.amountVnd))}. That is fine: what was actually sent is what is recorded.`
              : "Matches the claims' total."}
        </span>
      </div>
      <div className="u-row u-gap-1 u-wrap u-items-center">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !receipt || paidVnd === null || paidVnd <= 0} onClick={markPaid}>
          {pending ? "Recording…" : `Mark ${first} paid`}
        </button>
        <span className="admin-hint">{first} is emailed a link to the claim, where the receipt downloads. Receipts are kept 10 years.</span>
      </div>
      {allowReturn && (
        <details>
          <summary className="admin-hint">If the transfer failed</summary>
          <div className="u-stack u-gap-1 u-mt-1">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`return-${payment.id}`}>
                Why ({first} is told to check their bank details)
              </label>
              <textarea id={`return-${payment.id}`} className="admin-textarea" rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Account number rejected by the bank" />
            </div>
            <ConfirmButton
              label="Return to approved"
              title={`Return ${first}'s claims to approved?`}
              body="The claims leave this run and wait for the next one. The person is emailed your reason and asked to check their bank details."
              confirmLabel="Return to approved"
              disabled={pending || !reason.trim()}
              onConfirm={() => actions.giveBack(payment.id, reason)}
              onDone={done}
            />
          </div>
        </details>
      )}
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
