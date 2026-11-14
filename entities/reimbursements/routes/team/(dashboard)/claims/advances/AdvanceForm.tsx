"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { saigonToday } from "@/kernel/config/dates";
import type { MayProp } from "@/kernel/identity/may-prop";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { resumableUploadToSignedPath } from "@/kernel/ui/upload";
import { ADVANCE_MAX_VND } from "@/entities/reimbursements/lib/advance-policy";
import { canSubmitAdvance } from "@/entities/reimbursements/lib/advance-rules";
import { RECEIPT_PICKER_ACCEPT } from "@/entities/reimbursements/lib/receipt-accept";
import type { Trip } from "@/entities/reimbursements/lib/trip-rules";
import { settleByOf, type HolidayDay } from "@/entities/reimbursements/lib/working-days";
import { TripPicker } from "../TripPicker";
import { cancelOwnEvidence, confirmOwnEvidence, moveOwnAdvance, removeOwnEvidence, saveOwnAdvance, startOwnEvidence } from "./actions";

type Evidence = { id: string; filename: string };

const digitsOf = (text: string) => Number(text.replace(/\D/g, "")) || 0;

// The request (AD.5). The advance has to exist before a file can hang off it, so the
// first attach saves a draft, and sending saves what is typed before asking. The
// reasons shown are the rule's own, so what greys the button is what the server would
// refuse; it still decides on what it reads itself.
export function AdvanceForm(props: {
  advance: { id: string; purpose: string; amountVnd: number; spendEndsOn: string; tripEventId: string | null } | null;
  evidence: Evidence[];
  trips: Trip[];
  holidays: HolidayDay[] | null;
  paidTo: string | null;
  buyerName: string | null;
  approver: string;
  anotherOpen: boolean;
  may: MayProp;
}) {
  const router = useRouter();
  const [id, setId] = useState(props.advance?.id ?? null);
  const [purpose, setPurpose] = useState(props.advance?.purpose ?? "");
  const [amountText, setAmountText] = useState(props.advance ? props.advance.amountVnd.toLocaleString("en-US") : "");
  const [spendEndsOn, setSpendEndsOn] = useState(props.advance?.spendEndsOn ?? "");
  const [tripId, setTripId] = useState(props.advance?.tripEventId ?? null);
  const [promised, setPromised] = useState(false);
  const [evidence, setEvidence] = useState(props.evidence);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const amountVnd = digitsOf(amountText);
  const fields = { purpose, amountVnd, spendEndsOn, tripEventId: tripId };
  const ready = canSubmitAdvance({
    purpose,
    amountVnd,
    spendEndsOn: spendEndsOn || null,
    evidenceCount: evidence.length,
    promised,
    bankDetailsOnFile: props.paidTo !== null,
    // The first attach saves a draft, and the page then re-renders knowing a person has an open
    // advance. That one is this form's own, and one open advance is all a person can hold.
    anotherOpen: props.anotherOpen && id === null,
  });
  const reasons = ready.ok ? [] : ready.reasons;

  // A preview, from the same rule the payout uses. Until the money moves the deadline
  // is not set, so this says what it would be if the transfer were today.
  const deadline = useMemo(() => {
    if (!spendEndsOn || !props.holidays) return null;
    const result = settleByOf({ spendEndsOn, paidOutOn: saigonToday() }, props.holidays);
    return result.ok ? result.settleBy : null;
  }, [spendEndsOn, props.holidays]);

  /** Saves what is typed, and answers the advance's id, or says why not. */
  async function save(): Promise<string | null> {
    const saved = await saveOwnAdvance(id, fields);
    if (!saved.ok) {
      setError(saved.error);
      return null;
    }
    setId(saved.id);
    return saved.id;
  }

  function attach(file: File) {
    start(async () => {
      setError(null);
      const advanceId = await save();
      if (!advanceId) return;
      const started = await startOwnEvidence(advanceId, { name: file.name, size: file.size, type: file.type });
      if (!started.ok) return setError(started.error);
      setUploading(file.name);
      await new Promise<void>((resolve) => {
        const fail = async (message: string, cancel: boolean) => {
          if (cancel) await cancelOwnEvidence(advanceId, started.fileId);
          setError(message);
          setUploading(null);
          resolve();
        };
        resumableUploadToSignedPath({
          file,
          bucket: started.bucket,
          path: started.path,
          token: started.token,
          onProgress: () => {},
          onError: (why) => void fail(why === "refused" ? "The storage refused the file. Check its type and size." : "The upload stopped. Try again.", true),
          onSuccess: async () => {
            const confirmed = await confirmOwnEvidence(advanceId, started.fileId);
            if (!confirmed.ok) return void fail(confirmed.error, false);
            setEvidence((list) => [...list, { id: started.fileId, filename: file.name }]);
            setUploading(null);
            resolve();
          },
        });
      });
    });
  }

  function remove(file: Evidence) {
    start(async () => {
      if (!id) return;
      setError(null);
      const result = await removeOwnEvidence(id, file.id);
      if (!result.ok) return setError(result.error);
      setEvidence((list) => list.filter((f) => f.id !== file.id));
    });
  }

  function saveDraft() {
    start(async () => {
      setError(null);
      const advanceId = await save();
      if (advanceId) router.push(`/team/claims/advances/${advanceId}`);
    });
  }

  function send() {
    start(async () => {
      setError(null);
      const advanceId = await save();
      if (!advanceId) return;
      const moved = await moveOwnAdvance(advanceId, "submit", { promised });
      if (!moved.ok) return setError(moved.error);
      router.push(`/team/claims/advances/${advanceId}`);
    });
  }

  if (!props.may["reimbursements.mine"]) return null;
  const overMax = amountVnd > ADVANCE_MAX_VND;
  return (
    <div className="admin-form">
      <div className="admin-field admin-field--wide">
        <label className="admin-label" htmlFor="advance-purpose">What is it for?</label>
        <input id="advance-purpose" className="admin-input" value={purpose} maxLength={500} autoComplete="off" onChange={(e) => setPurpose(e.target.value)} />
      </div>
      <div className="admin-field admin-field--wide">
        <label className="admin-label" htmlFor="advance-trip">Event <span className="admin-cell-muted">(optional)</span></label>
        <TripPicker id="advance-trip" trips={props.trips} value={tripId} onChange={setTripId} disabled={pending} />
      </div>
      <div className="admin-form-row">
        <div className="admin-field">
          <label className="admin-label" htmlFor="advance-amount">Amount (VND)</label>
          <input
            id="advance-amount"
            className="admin-input admin-cell-mono"
            inputMode="numeric"
            autoComplete="off"
            value={amountText}
            onChange={(e) => {
              const n = digitsOf(e.target.value);
              setAmountText(n ? n.toLocaleString("en-US") : "");
            }}
          />
          <span className={overMax ? "adv-err" : "admin-hint"}>{overMax ? "Above the maximum. Ask for less, or split the purchase." : `Up to ${formatVndWhole(ADVANCE_MAX_VND)}.`}</span>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="advance-date">Purchase date, or the trip&apos;s last day</label>
          <input id="advance-date" className="admin-input" type="date" value={spendEndsOn} onChange={(e) => setSpendEndsOn(e.target.value)} />
        </div>
      </div>
      {deadline && (
        <div className="admin-alert admin-alert--info">
          <span className="u-strong">Settle by {formatDate(deadline)}.</span> Ten working days after that date. If the money reaches you later, the ten days start from then.
        </div>
      )}
      <div className="admin-field admin-field--wide">
        <span className="admin-label">The quote, contract, booking or trip estimate</span>
        {evidence.map((file) => (
          <div key={file.id} className="adv-drop is-done">
            <span className="adv-tick">✓</span>
            <span className="u-strong u-min-0 u-grow">{file.filename}</span>
            <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => remove(file)}>Remove</button>
          </div>
        ))}
        {evidence.length === 0 && (
          <button type="button" className="adv-drop" disabled={pending} onClick={() => picker.current?.click()}>
            <span className="adv-tick is-no">+</span>
            <span>
              <span className="u-strong">{uploading ? `Uploading ${uploading}…` : "Choose a file"}</span>
              <span className="admin-list-sub adv-block">A PDF or a photo that shows the amount.</span>
            </span>
          </button>
        )}
        <input
          ref={picker}
          type="file"
          accept={RECEIPT_PICKER_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) attach(file);
          }}
        />
      </div>
      <div className="admin-field admin-field--wide">
        <span className="admin-label">Paid to</span>
        <span>{props.paidTo ?? "No bank details on your profile yet."}</span>
        <span className="admin-hint">From your profile. The transfer goes here.</span>
      </div>
      <label className="u-row u-gap-1 u-items-center admin-field--wide">
        <input type="checkbox" checked={promised} onChange={(e) => setPromised(e.target.checked)} />
        <span>I will settle this by the date above with red invoices{props.buyerName ? ` made out to ${props.buyerName}` : ""}, and return what I do not spend.</span>
      </label>
      {reasons.length > 0 && (
        <div className="admin-alert admin-alert--warn admin-field--wide">
          <span className="u-strong">Before it can go to {props.approver}:</span>
          <ul className="adv-why">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err admin-field--wide" role="alert">{error}</div>}
      <div className="admin-form-actions admin-field--wide">
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || reasons.length > 0} onClick={send}>{pending ? "Working…" : `Send to ${props.approver}`}</button>
        <button type="button" className="admin-btn" disabled={pending} onClick={saveDraft}>Save as draft</button>
      </div>
    </div>
  );
}
