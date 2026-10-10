"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { OwnerRemoval } from "@/entities/reimbursements/lib/retention-rules";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { markOwnItemRemoved, removeOwnItem } from "../actions";

// Taking a receipt off the owner's claim (plan §10, 20261008090000). From a
// draft that was never submitted it is deleted, with its documents. From a
// claim that was (sent back, or withdrawn to a draft) nothing is deleted: the
// owner says why, and the receipt stays on the claim, marked removed, counted
// toward nothing. The page hands `removal` from `ownerCan(claim).remove`, the
// same rule the actions and the database apply.
// `may` carries reimbursements.mine from the page (ADR 0014): hiding is a
// courtesy, the actions' own guards are the rule.
export function RemoveItem({ claimId, item, removal, may }: { claimId: string; item: MyItem; removal: Exclude<OwnerRemoval, null>; may: MayProp }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!may["reimbursements.mine"]) return null;

  if (removal === "delete") {
    return (
      <ConfirmButton
        className="admin-btn admin-btn--sm admin-btn--ghost"
        label="Remove"
        title={`Remove ${item.label}?`}
        body="The receipt and its documents are deleted from this draft."
        confirmLabel="Remove"
        onConfirm={() => removeOwnItem(claimId, item.id)}
        onDone={() => router.refresh()}
      />
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const res = await markOwnItemRemoved(claimId, item.id, reason);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setReason("");
      router.refresh();
    });

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setOpen(true)}>
        Remove
      </button>
    );
  }
  return (
    <span className="u-stack u-gap-1">
      <span className="admin-hint">This claim was submitted before, so the receipt stays on it, marked removed, and is no longer counted.</span>
      <input
        className="admin-input"
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why you are removing it"
        aria-label="Why you are removing this receipt"
      />
      <span className="u-row u-gap-1">
        <button type="button" className="admin-btn admin-btn--sm admin-btn--danger" disabled={pending || !reason.trim()} onClick={save}>
          Remove
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </span>
      {error && (
        <span className="admin-alert admin-alert--err" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
