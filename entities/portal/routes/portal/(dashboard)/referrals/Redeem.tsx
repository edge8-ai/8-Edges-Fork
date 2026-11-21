"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/kernel/ui/format";
import { chooseRedemption } from "./actions";

// The affiliate's per-commission choice: take it as 20% work credit or 10%
// cash. Shown for pending commissions, and (as "switch") for chosen ones that
// haven't been paid out yet.
export function Redeem({
  commissionId,
  choice,
  workCreditCents,
  cashCents,
  paidOut,
}: {
  commissionId: string;
  choice: "work_credit" | "cash" | null;
  workCreditCents: number;
  cashCents: number;
  paidOut: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function pick(next: "work_credit" | "cash") {
    setErr(null);
    start(async () => {
      const r = await chooseRedemption(commissionId, next);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  }

  if (paidOut) return null;

  if (choice == null) {
    return (
      <div className="u-stack u-items-end">
        <div className="u-row u-end u-wrap">
          <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => pick("work_credit")}>
            Take {formatCents(workCreditCents, "usd")} work credit
          </button>
          <button type="button" className="admin-btn" disabled={pending} onClick={() => pick("cash")}>
            Take {formatCents(cashCents, "usd")} cash
          </button>
        </div>
        {err && <span className="u-sm u-err">{err}</span>}
      </div>
    );
  }

  const other = choice === "work_credit" ? "cash" : "work_credit";
  const otherAmt = choice === "work_credit" ? cashCents : workCreditCents;
  return (
    <div className="u-stack u-items-end u-gap-1">
      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => pick(other)}>
        Switch to {other === "cash" ? `${formatCents(otherAmt, "usd")} cash` : `${formatCents(otherAmt, "usd")} work credit`}
      </button>
      {err && <span className="u-sm u-err">{err}</span>}
    </div>
  );
}
