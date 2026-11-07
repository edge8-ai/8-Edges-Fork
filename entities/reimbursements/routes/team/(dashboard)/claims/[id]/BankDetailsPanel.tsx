"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { formatDate } from "@/kernel/ui/format";
import { confirmOwnBankDetails, saveOwnBankDetails } from "../actions";

type Details = { bankName: string; accountNumber: string; branch: string };

// Where the claim is paid (RB.5, design §1.11): the owner's own bank details,
// pre-filled from their record. They confirm them or change them here; a
// change is saved to their record (the same one /team/profile edits), and the
// person and HR are emailed that it changed, never the values. With nothing
// on file the form opens straight away, because Finance cannot pay without it,
// and the claim cannot be submitted until it is filled in. A confirmation is
// recorded on the claim (`confirmedAt`, from its metadata), so it is still
// there after a reload; it is offered only while the claim is the owner's to
// change (`confirmable`), and saving new details on such a claim confirms them.
export function BankDetailsPanel({
  details,
  claimId,
  confirmedAt,
  confirmable,
}: {
  details: Details | null;
  claimId: string;
  confirmedAt: string | null;
  confirmable: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(details === null);
  const [d, setD] = useState<Details>(details ?? { bankName: "", accountNumber: "", branch: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await confirmOwnBankDetails(claimId);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveOwnBankDetails(d);
      if (!res.ok) return setError(res.error);
      if (confirmable) {
        const confirmed = await confirmOwnBankDetails(claimId);
        if (!confirmed.ok) setError(confirmed.error);
      }
      setEditing(false);
      router.refresh();
    });

  const cancel = () => {
    setD(details ?? { bankName: "", accountNumber: "", branch: "" });
    setError(null);
    setEditing(false);
  };

  return (
    <div className="u-stack u-gap-4">
      <h2 className="admin-card-title">Paid to</h2>
      {!editing && details && (
        <>
          <dl className="u-stack u-gap-1 u-m-0">
            <div>
              <dt className="admin-label">Bank</dt>
              <dd className="u-m-0">{details.bankName}</dd>
            </div>
            <div>
              <dt className="admin-label">Account number</dt>
              <dd className="u-m-0 admin-cell-mono">{details.accountNumber}</dd>
            </div>
            {details.branch && (
              <div>
                <dt className="admin-label">Branch</dt>
                <dd className="u-m-0">{details.branch}</dd>
              </div>
            )}
          </dl>
          {confirmedAt ? (
            <p className="admin-hint u-m-0" role="status">
              You confirmed these on {formatDate(confirmedAt)}. This is where Finance pays this claim.
            </p>
          ) : (
            <p className="admin-hint u-m-0">From your profile.{confirmable ? " Check this is where you want to be paid." : ""}</p>
          )}
          {error && (
            <div className="admin-alert admin-alert--err" role="alert">
              {error}
            </div>
          )}
          <div className="admin-form-actions">
            {!confirmedAt && confirmable && (
              <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={confirm}>
                These are right
              </button>
            )}
            <button type="button" className="admin-btn" disabled={pending} onClick={() => setEditing(true)}>
              Change
            </button>
          </div>
        </>
      )}
      {editing && (
        <>
          {!details && (
            <div className="admin-alert admin-alert--info" role="status">
              Add the account Finance should pay your claims to.
            </div>
          )}
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-bank`}>Bank</label>
            <input id={`${id}-bank`} className="admin-input" value={d.bankName} placeholder="Techcombank" autoComplete="off" onChange={(e) => setD({ ...d, bankName: e.target.value })} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-acct`}>Account number</label>
            <input id={`${id}-acct`} className="admin-input u-tabular" inputMode="numeric" autoComplete="off" value={d.accountNumber} onChange={(e) => setD({ ...d, accountNumber: e.target.value })} />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${id}-branch`}>Branch (optional)</label>
            <input id={`${id}-branch`} className="admin-input" value={d.branch} autoComplete="off" onChange={(e) => setD({ ...d, branch: e.target.value })} />
          </div>
          <p className="admin-hint u-m-0">Saved to your profile. You and HR get an email whenever these change.</p>
          {error && (
            <div className="admin-alert admin-alert--err" role="alert">
              {error}
            </div>
          )}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
            {details && (
              <button type="button" className="admin-btn" disabled={pending} onClick={cancel}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
