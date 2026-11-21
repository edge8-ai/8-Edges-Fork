"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { MyItem } from "@/entities/reimbursements/lib/my-claims";
import { formatOriginal } from "@/entities/reimbursements/lib/currencies";
import { JOIN_LABEL, type JoinKind } from "@/entities/reimbursements/lib/join-rules";
import { joinOwnRow } from "../actions";

// The one control a bank deduction or a red invoice that came in on its own
// carries (RB.26): "Paid for [receipt] Join", or "Red invoice for [receipt]
// Join". The receipts are the ones it may join, nearest first (join-rules
// `joinTargets`), so the likeliest is already picked; nothing joins until the
// owner presses Join (Khoa, 2026-11-06: "auto join is annoying"). A bank
// deduction with no receipt to join yet says what to drop; a red invoice can
// stand alone, so it then says nothing. `may` carries reimbursements.mine from
// the page (ADR 0014): hiding is a courtesy, the action's own guard is the rule.
export function JoinToReceipt({ claimId, item, kind, targets, may }: { claimId: string; item: MyItem; kind: JoinKind; targets: MyItem[]; may: MayProp }) {
  const router = useRouter();
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!may["reimbursements.mine"]) return null;
  if (targets.length === 0) {
    return kind === "bank_deduction" ? <span className="admin-hint">Drop the receipt this paid for, then join them here.</span> : null;
  }

  const join = () =>
    start(async () => {
      setError(null);
      const res = await joinOwnRow(claimId, item.id, target);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  const id = `${item.id}-join`;
  return (
    <div className="u-stack u-gap-1 u-mt-1">
      <div className="u-row u-gap-1 u-items-center u-wrap">
        <label className="admin-label" htmlFor={id}>
          {JOIN_LABEL[kind]}
        </label>
        <select id={id} className="admin-select u-w-auto" value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} · {formatOriginal(t.amount, t.currency)}
            </option>
          ))}
        </select>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" disabled={pending || !target} onClick={join}>
          {pending ? "Joining…" : "Join"}
        </button>
      </div>
      {error && (
        <div className="admin-alert admin-alert--err" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
