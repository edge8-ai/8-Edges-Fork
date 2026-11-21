"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saigonToday } from "@/kernel/config/dates";
import type { MayProp } from "@/kernel/identity/may-prop";
import { formatVndWhole } from "@/kernel/ui/format";
import { resumableUploadToSignedPath } from "@/kernel/ui/upload";
import { RECEIPT_PICKER_ACCEPT } from "@/entities/reimbursements/lib/receipt-accept";
import { DetailRow } from "@/entities/reimbursements/ui/RedInvoiceHint";
import { cancelBankReceipt, confirmBankReceipt, payOutAdvance, recordAdvanceReturn, startBankReceipt } from "../actions";

type Receipt = { id: string; filename: string };
type Answer = { ok: true } | { ok: false; error: string };

const digitsOf = (text: string) => Number(text.replace(/\D/g, "")) || 0;

/** The form's own key for a transfer. It stays through a failed try, so a retry records one transfer, and changes only after one lands. */
const newKey = () => crypto.randomUUID();

/** The bank's receipt, sent straight to the bucket and confirmed by what arrived. */
function ReceiptDrop(props: { advanceId: string; receipt: Receipt | null; onChange: (receipt: Receipt) => void; onError: (message: string | null) => void; required: boolean; disabled: boolean }) {
  const [uploading, setUploading] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function attach(file: File) {
    props.onError(null);
    const started = await startBankReceipt(props.advanceId, { name: file.name, size: file.size, type: file.type });
    if (!started.ok) return props.onError(started.error);
    setUploading(file.name);
    const fail = async (message: string, cancel: boolean) => {
      if (cancel) await cancelBankReceipt(props.advanceId, started.fileId);
      props.onError(message);
      setUploading(null);
    };
    resumableUploadToSignedPath({
      file,
      bucket: started.bucket,
      path: started.path,
      token: started.token,
      onProgress: () => {},
      onError: (why) => void fail(why === "refused" ? "The storage refused the file. Check its type and size." : "The upload stopped. Try again.", true),
      onSuccess: async () => {
        const confirmed = await confirmBankReceipt(props.advanceId, started.fileId);
        if (!confirmed.ok) return void fail(confirmed.error, false);
        props.onChange({ id: started.fileId, filename: file.name });
        setUploading(null);
      },
    });
  }

  return (
    <div className="admin-field admin-field--wide">
      <span className="admin-label">The bank&apos;s receipt{props.required ? "" : " (optional)"}</span>
      <button type="button" className={`adv-drop${props.receipt ? " is-done" : ""}`} disabled={props.disabled || uploading !== null} onClick={() => picker.current?.click()}>
        <span className={`adv-tick${props.receipt ? "" : " is-no"}`}>{props.receipt ? "✓" : "+"}</span>
        <span className="u-min-0">
          <span className="u-strong">{uploading ? `Uploading ${uploading}…` : (props.receipt?.filename ?? `Upload the bank's receipt${props.required ? " (required)" : ""}`)}</span>
          {props.receipt && <span className="admin-list-sub adv-block">Choose another to replace it.</span>}
        </span>
      </button>
      <input
        ref={picker}
        type="file"
        accept={RECEIPT_PICKER_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void attach(file);
        }}
      />
    </div>
  );
}

/** The date the bank shows for a transfer: today unless they say otherwise, and never later. */
function TransferDate({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>Date on the bank&apos;s receipt</label>
      <input id={id} className="admin-input" type="date" max={saigonToday()} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/**
 * Where to send it, and recording that it went (design section 6). The amount is the
 * approved one and cannot be changed here: if the bank sent anything else, that is a
 * conversation, not a figure to type.
 */
export function PayoutPanel(props: {
  advanceId: string;
  amountVnd: number;
  reference: string;
  owner: string;
  /** Null when the money has already gone and this only records it: nobody needs the account. */
  bank: { bankName: string; branch: string; accountNumber: string } | null;
  receipt: Receipt | null;
  may: MayProp;
}) {
  const router = useRouter();
  const [receipt, setReceipt] = useState(props.receipt);
  // Recording one already made, today is a guess that books the wrong day in account 141, so they say.
  const [transferredOn, setTransferredOn] = useState(() => (props.bank ? saigonToday() : ""));
  const [requestKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!props.may["reimbursements.pay"]) return null;

  const record = () =>
    start(async () => {
      setError(null);
      if (!receipt) return setError("Upload the bank's receipt first.");
      const result: Answer = await payOutAdvance(props.advanceId, { amountVnd: props.amountVnd, transferredOn, requestKey, receiptFileId: receipt.id });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">{props.bank ? "Transfer it today" : "Record the transfer you made"}</h2>
      <div className="u-stack u-gap-1">
        {props.bank && <DetailRow label="Bank" value={[props.bank.bankName, props.bank.branch].filter(Boolean).join(" · ")} />}
        {props.bank && <DetailRow label="Account" value={props.bank.accountNumber} />}
        <DetailRow label="Name" value={props.owner} />
        <DetailRow label="Amount" value={String(props.amountVnd)} />
        <DetailRow label="Reference" value={`${props.reference} TAM UNG`} />
      </div>
      <div className="admin-form u-mt-4">
        <ReceiptDrop advanceId={props.advanceId} receipt={receipt} onChange={setReceipt} onError={setError} required disabled={pending} />
        <TransferDate id="advance-payout-date" value={transferredOn} onChange={setTransferredOn} />
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
      <div className="admin-form-actions u-mt-4">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || !receipt || !transferredOn} onClick={record}>Record the transfer</button>
      </div>
      <p className="admin-hint u-m-0 u-mt-2">Exactly {formatVndWhole(props.amountVnd)}, once. Books as Nợ 141 / Có 112. {props.owner} is told, with the settle-by date.</p>
    </section>
  );
}

/**
 * A move lost after its transfer was recorded: the ledger already holds the money, and only
 * the status is left to land. No receipt and no date, because the row on the ledger is what stands.
 */
export function FinishRecording(props: { line: string; button: string; finish: () => Promise<Answer>; may: MayProp }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!props.may["reimbursements.pay"]) return null;
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Finish recording this</h2>
      <p className="u-m-0">{props.line}</p>
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
      <div className="admin-form-actions u-mt-4">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await props.finish();
              if (!result.ok) return setError(result.error);
              router.refresh();
            })
          }
        >
          {props.button}
        </button>
      </div>
    </section>
  );
}

/** Finishes a payout already on the ledger. */
export function FinishPayout(props: { advanceId: string; amountVnd: number; transferredOn: string; line: string; may: MayProp }) {
  const [requestKey] = useState(newKey);
  return <FinishRecording line={props.line} button="Finish recording the transfer" may={props.may} finish={() => payOutAdvance(props.advanceId, { amountVnd: props.amountVnd, transferredOn: props.transferredOn, requestKey, receiptFileId: null })} />;
}

/** Closes an advance whose returns already add up to what was owed. */
export function FinishReturn(props: { advanceId: string; line: string; may: MayProp }) {
  const [requestKey] = useState(newKey);
  return <FinishRecording line={props.line} button="Close the advance" may={props.may} finish={() => recordAdvanceReturn(props.advanceId, { amountVnd: 0, transferredOn: saigonToday(), requestKey, receiptFileId: null })} />;
}

/** Money coming back, recorded as each transfer arrives: a short one stays owed, and the bank is the truth whether or not the person said they sent it. */
export function ReturnPanel(props: { advanceId: string; owedVnd: number; line: string; may: MayProp }) {
  const router = useRouter();
  const [amountText, setAmountText] = useState(props.owedVnd.toLocaleString("en-US"));
  // Never filled in from an earlier upload: a leftover must not stand as proof of this transfer without someone choosing it.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [transferredOn, setTransferredOn] = useState(saigonToday);
  const [requestKey, setRequestKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!props.may["reimbursements.pay"]) return null;

  const amountVnd = digitsOf(amountText);
  const record = () =>
    start(async () => {
      setError(null);
      if (amountVnd < 1) return setError("Enter what arrived.");
      if (amountVnd > props.owedVnd) return setError(`${formatVndWhole(props.owedVnd)} is still owed, so ${formatVndWhole(amountVnd)} cannot be recorded.`);
      const result: Answer = await recordAdvanceReturn(props.advanceId, { amountVnd, transferredOn, requestKey, receiptFileId: receipt?.id ?? null });
      if (!result.ok) return setError(result.error);
      setRequestKey(newKey());
      setReceipt(null);
      router.refresh();
    });

  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">Money coming back</h2>
      <p className="u-m-0 u-mb-3">{props.line}</p>
      <div className="admin-form">
        <div className="admin-form-row">
          <div className="admin-field">
            <label className="admin-label" htmlFor="advance-return-amount">Arrived in the company&apos;s account (VND)</label>
            <input
              id="advance-return-amount"
              className="admin-input admin-cell-mono"
              inputMode="numeric"
              autoComplete="off"
              value={amountText}
              onChange={(e) => {
                const n = digitsOf(e.target.value);
                setAmountText(n ? n.toLocaleString("en-US") : "");
              }}
            />
          </div>
          <TransferDate id="advance-return-date" value={transferredOn} onChange={setTransferredOn} />
        </div>
        <ReceiptDrop advanceId={props.advanceId} receipt={receipt} onChange={setReceipt} onError={setError} required={false} disabled={pending} />
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
      <div className="admin-form-actions u-mt-4">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={record}>Record money received</button>
      </div>
      <p className="admin-hint u-m-0 u-mt-2">A short transfer is recorded and the rest stays owed. Books as Nợ 112 / Có 141.</p>
    </section>
  );
}
