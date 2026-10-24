"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMyTeamBalance } from "./actions";

// The client manager's sign-off, inside the leave shelf. It records that the
// manager checked this balance as it stands now; the shelf shows it as stale
// again once anything in the balance changes.
export function ConfirmBalanceButton({ teamMemberId, stale }: { teamMemberId: string; stale: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function confirm() {
    setMessage(null);
    startTransition(async () => {
      const res = await confirmMyTeamBalance(teamMemberId);
      if (res.ok) {
        setMessage({ tone: "ok", text: "Balance confirmed." });
        router.refresh();
      } else {
        setMessage({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <div className="u-stack u-gap-2">
      <div>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending} onClick={confirm}>
          {pending ? "Confirming…" : stale ? "Confirm again" : "Looks right"}
        </button>
      </div>
      {message && <div className={`admin-alert admin-alert--${message.tone}`}>{message.text}</div>}
    </div>
  );
}
