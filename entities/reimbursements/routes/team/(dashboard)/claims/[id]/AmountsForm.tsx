"use client";

import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import type { OwnerRemoval } from "@/entities/reimbursements/lib/retention-rules";
import { CLAIM_CURRENCIES, minorFromTyped, typedFromMinor } from "@/entities/reimbursements/lib/currencies";
import { DOCUMENT_KIND_LABEL, type DocumentKind } from "@/entities/reimbursements/lib/claim-labels";
import { hasJoinedDeduction, isLoneDeduction } from "@/entities/reimbursements/lib/join-rules";
import { ItemDocuments } from "./ItemDocuments";
import { RemoveItem } from "./RemoveItem";
import { refileOwnDocument, unjoinOwnDocument, updateOwnItemAmounts } from "../actions";

// Edit for a receipt whose files were read (RB.26, Khoa 2026-11-06: "the only
// thing they can change is the numbers"). It holds the amounts, what each file
// is, the files and the row's actions, and nothing else: seller, date and
// category come from the files. The amount on the receipt in its currency, and
// what is paid to the owner in dong: the bank deduction's figure when one is
// joined, which is always what is paid; empty, the bank's selling rate on the
// receipt's date; typed, what the owner says the bank took. A lone bank
// deduction is its dong amount alone. Each file's kind is a picker set to the
// AI's read, which the owner can change (RB.26.6: "not allowing human override
// is dumb"); the form follows the kinds as they are being set, and Save refiles
// a changed file before it saves the amounts. A joined bank deduction or red
// invoice can be unjoined beside its file. Save and Cancel sit together;
// Remove sits apart on the right.
export function AmountsForm({ claimId, item, removal, may, onDone }: { claimId: string; item: MyItem; removal: OwnerRemoval; may: MayProp; onDone: () => void }) {
  const current = item.documents.filter((d) => !d.replacedAt);
  const [kinds, setKinds] = useState<Record<string, DocumentKind>>(() => Object.fromEntries(current.map((d) => [d.id, d.kind])));
  const draft = item.documents.map((d) => ({ ...d, kind: kinds[d.id] ?? d.kind }));
  const changed = current.filter((d) => kinds[d.id] !== d.kind);
  const lone = isLoneDeduction(draft);
  const joined = hasJoinedDeduction(draft);
  const [amount, setAmount] = useState(item.amount > 0 ? typedFromMinor(item.amount, item.currency) : "");
  const [currency, setCurrency] = useState(item.currency);
  const [paid, setPaid] = useState(item.chargedVnd ? typedFromMinor(item.chargedVnd, "vnd") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const foreign = currency !== "vnd";
  const id = (name: string) => `${item.id}-${name}`;
  const files = current.length;
  const kindWord = (k: DocumentKind) => `a ${DOCUMENT_KIND_LABEL[k].toLowerCase()}`;
  const kindHint =
    changed.length === 0
      ? files === 1
        ? `The AI read this file as ${kindWord(current[0].kind)}. If it is something else, change it here.`
        : "Each file is set to what the AI read it as. If one is something else, change it here."
      : lone
        ? "Saving files it as a bank deduction: its row then asks which receipt it paid for."
        : `Saving files ${changed.length === 1 ? `it as ${kindWord(kinds[changed[0].id])}` : "them as you set them"}.`;

  const save = () =>
    start(async () => {
      setError(null);
      for (const doc of changed) {
        const refiled = await refileOwnDocument(claimId, doc.id, kinds[doc.id]);
        if (!refiled.ok) return setError(refiled.error);
      }
      const minor = minorFromTyped(amount, lone ? "vnd" : currency);
      if (minor === null) return setError(lone ? "Enter what the bank took, in whole dong." : `Enter the amount in ${currency.toUpperCase()}${foreign ? "" : ", in whole dong"}.`);
      const paidVnd = !lone && foreign && paid.trim() ? minorFromTyped(paid, "vnd") : null;
      if (!lone && foreign && paid.trim() && paidVnd === null) return setError("Enter what you are paid in whole dong.");
      const res = await updateOwnItemAmounts(claimId, item.id, { amount: minor, currency: lone ? "vnd" : currency, paidVnd });
      if (!res.ok) return setError(res.error);
      onDone();
    });

  const unjoin = (fileId: string) =>
    start(async () => {
      setError(null);
      const res = await unjoinOwnDocument(claimId, item.id, fileId);
      if (!res.ok) return setError(res.error);
      onDone();
    });

  return (
    <div className="u-stack u-gap-4">
      <div className="u-stack u-gap-1">
        <div className="admin-list-title">{item.label}</div>
        <div className="admin-list-sub">
          Read from {files === 1 ? "1 file" : `${files} files`}. The amounts, and what each file is, are yours to correct.
        </div>
      </div>
      <div className="u-grid-2">
        {!lone && (
          <div className="admin-field">
            <label className="admin-label" htmlFor={id("amount")}>
              Amount on the receipt
            </label>
            <div className="u-row u-gap-1 u-items-center">
              <input id={id("amount")} className="admin-input u-tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select className="admin-select u-w-auto" aria-label="Currency" value={currency} disabled={joined} onChange={(e) => setCurrency(e.target.value)}>
                {CLAIM_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <span className="admin-hint">As printed on the receipt.</span>
          </div>
        )}
        {(lone || foreign) && (
          <div className="admin-field">
            <label className="admin-label" htmlFor={id("paid")}>
              Paid to you (₫)
            </label>
            <input
              id={id("paid")}
              className="admin-input u-tabular"
              inputMode="numeric"
              value={lone ? amount : paid}
              placeholder={!lone && !joined && item.amountVnd !== null && item.chargedVnd === null ? typedFromMinor(item.amountVnd, "vnd") : undefined}
              onChange={(e) => (lone ? setAmount(e.target.value) : setPaid(e.target.value))}
            />
            <span className="admin-hint">
              {lone
                ? "Read from the bank deduction. This is what you are paid once it is joined to its receipt."
                : joined
                  ? "From your bank deduction. This is what you are paid."
                  : "Empty: paid at the bank's selling rate on the receipt's date. Type what your bank took to be paid that."}
            </span>
          </div>
        )}
      </div>
      <div className="u-stack u-gap-1">
        <span className="admin-label">Files</span>
        <ItemDocuments item={item} kinds={kinds} onKind={(fileId, kind) => setKinds((prev) => ({ ...prev, [fileId]: kind }))} onUnjoin={unjoin} pending={pending} />
        {files > 0 && <span className="admin-hint">{kindHint}</span>}
      </div>
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
      <div className="u-row u-between u-items-center u-wrap u-gap-2">
        <div className="admin-form-actions">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={onDone}>
            Cancel
          </button>
        </div>
        {removal && <RemoveItem claimId={claimId} item={item} removal={removal} may={may} label={lone ? "Remove bank deduction" : "Remove receipt"} className="admin-btn admin-btn--danger" />}
      </div>
    </div>
  );
}
