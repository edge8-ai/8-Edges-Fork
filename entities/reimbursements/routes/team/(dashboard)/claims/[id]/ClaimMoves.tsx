"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { deleteOwnDraft, moveOwnClaim } from "../actions";

// What the owner can do with the claim as a whole: submit it (or resubmit it
// once fixed), withdraw it back to draft while it waits to be checked, or
// delete a draft that was never submitted. Submit stays disabled while the
// page's reasons, from the same `canSubmit` the submit action asks, are open.
export function ClaimMoves({
  claimId,
  can,
  blockers,
  resubmit,
}: {
  claimId: string;
  can: { submit: boolean; withdraw: boolean; delete: boolean };
  blockers: string[];
  resubmit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await moveOwnClaim(claimId, "submit");
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  return (
    <div className="u-stack u-gap-4">
      {can.submit && blockers.length > 0 && (
        <div className="admin-alert admin-alert--info" role="status">
          <span className="u-strong">Why you cannot submit yet</span>
          <ul className="u-list u-mt-1 u-mb-1">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {can.submit && (
        <button type="button" className="admin-btn admin-btn--primary" disabled={pending || blockers.length > 0} onClick={submit}>
          {pending ? "Submitting…" : resubmit ? "Resubmit" : "Submit"}
        </button>
      )}
      {can.withdraw && (
        <ConfirmButton
          className="admin-btn"
          label="Withdraw to change it"
          title="Withdraw this claim?"
          body="It goes back to draft and leaves Finance's list. Change what you need, then submit it again. Its history keeps both submissions."
          confirmLabel="Withdraw"
          onConfirm={() => moveOwnClaim(claimId, "withdraw")}
          onDone={() => router.refresh()}
        />
      )}
      {can.delete && (
        <ConfirmButton
          label="Delete draft"
          title="Delete this draft?"
          body="The draft, its receipts and their documents are deleted. Only a draft that was never submitted can be."
          confirmLabel="Delete"
          onConfirm={() => deleteOwnDraft(claimId)}
          onDone={() => router.push("/team/claims")}
        />
      )}
      {!can.submit && !can.withdraw && (
        <p className="admin-hint u-m-0">Locked. Receipts and red invoices are kept for ten years and cannot be deleted once submitted.</p>
      )}
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
