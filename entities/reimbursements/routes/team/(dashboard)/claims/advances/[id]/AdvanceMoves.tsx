"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { deleteOwnAdvance, moveOwnAdvance, openOwnAdvanceFile, reportOwnReturn, returnOwnUnspent, settleOwnAdvance } from "../actions";

// What the owner can do from the advance's page (AD.5, AD.8). What is offered comes from
// the rules, handed down by the page, and the server asks again.
export function AdvanceMoves(props: {
  advanceId: string;
  can: { edit: boolean; submit: boolean; withdraw: boolean; cancel: boolean; delete: boolean; settle: boolean; returnUnspent: boolean };
  /** A settlement claim already exists, so settling continues it and "I spent none of it" is not on offer. */
  settlementStarted: boolean;
  /** A cancel of an approved advance tells Finance why, so it needs a reason. */
  cancelNeedsReason: boolean;
  fixing: boolean;
  may: MayProp;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  const run = (act: () => Promise<{ ok: true } | { ok: false; error: string }>, then?: () => void) =>
    start(async () => {
      setError(null);
      const result = await act();
      if (!result.ok) return setError(result.error);
      then?.();
      router.refresh();
    });

  if (!props.may["reimbursements.mine"]) return null;
  const { can } = props;
  return (
    <>
      <div className="admin-form-actions u-mt-4">
        {can.edit && <Link className="admin-btn admin-btn--primary" href={`/team/claims/advances/${props.advanceId}/edit`}>{props.fixing ? "Fix and send again" : "Finish and send"}</Link>}
        {can.settle && (
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const started = await settleOwnAdvance(props.advanceId);
                if (!started.ok) return setError(started.error);
                router.push(`/team/claims/${started.id}`);
              })
            }
          >
            {props.settlementStarted ? "Continue your settlement" : "Settle with your receipts"}
          </button>
        )}
        {can.returnUnspent && !props.settlementStarted && !returning && <button type="button" className="admin-btn" disabled={pending} onClick={() => setReturning(true)}>I spent none of it</button>}
        {can.withdraw && <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => moveOwnAdvance(props.advanceId, "withdraw"))}>Withdraw it</button>}
        {can.delete && <button type="button" className="admin-btn admin-btn--danger" disabled={pending} onClick={() => run(() => deleteOwnAdvance(props.advanceId), () => router.push("/team/claims"))}>Delete this draft</button>}
        {can.cancel && !cancelling && (
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            disabled={pending}
            onClick={() => (props.cancelNeedsReason ? setCancelling(true) : run(() => moveOwnAdvance(props.advanceId, "cancel")))}
          >
            I don&apos;t need it any more
          </button>
        )}
      </div>
      {returning && (
        <div className="admin-field u-mt-4">
          <p className="u-m-0">You return all of it by bank transfer, and Finance records it when it arrives. This cannot be undone: if you spent any of it, settle with your receipts instead.</p>
          <div className="admin-form-actions u-mt-2">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => returnOwnUnspent(props.advanceId), () => setReturning(false))}>Yes, I spent none of it</button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setReturning(false)}>Keep it</button>
          </div>
        </div>
      )}
      {cancelling && (
        <div className="admin-field u-mt-4">
          <label className="admin-label" htmlFor="advance-cancel-reason">Why? Finance reads this, so nobody sends the money.</label>
          <textarea id="advance-cancel-reason" className="admin-textarea" rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="admin-form-actions u-mt-2">
            <button type="button" className="admin-btn admin-btn--danger" disabled={pending || !reason.trim()} onClick={() => run(() => moveOwnAdvance(props.advanceId, "cancel", { reason }))}>Cancel the advance</button>
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setCancelling(false)}>Keep it</button>
          </div>
        </div>
      )}
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
    </>
  );
}

/** The return's own button: a hint for Finance that the money is on its way. */
export function ReportReturn({ advanceId, reported, may }: { advanceId: string; reported: boolean; may: MayProp }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!may["reimbursements.mine"]) return null;
  return (
    <>
      <div className="admin-form-actions u-mt-4">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          disabled={pending || reported}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await reportOwnReturn(advanceId);
              if (!result.ok) return setError(result.error);
              router.refresh();
            })
          }
        >
          {reported ? "You said you sent it" : "I have sent it"}
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--err u-mt-2" role="alert">{error}</div>}
    </>
  );
}

/** Opens a file on the advance through a short-lived link. */
export function OpenAdvanceFile({ advanceId, fileId, name, may }: { advanceId: string; fileId: string; name: string; may: MayProp }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!may["reimbursements.mine"]) return <>{name}</>;
  return (
    <>
      <button
        type="button"
        className="adv-link"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            // Opened before the await, so the browser treats it as the click's own window and does not block it.
            const tab = window.open("", "_blank");
            const signed = await openOwnAdvanceFile(advanceId, fileId);
            if (!signed.ok) {
              tab?.close();
              return setError(signed.error);
            }
            if (tab) tab.location.href = signed.url;
            else window.location.href = signed.url;
          })
        }
      >
        {name}
      </button>
      {error && <span className="adv-err"> {error}</span>}
    </>
  );
}
