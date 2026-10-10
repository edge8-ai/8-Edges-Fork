"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runInvoiceSync, type SyncSummary } from "./sync-action";
import type { MayProp } from "@/kernel/identity/may-prop";

// "Sync now": pulls both QuickBooks companies into the ledger on demand (same
// engine as the weekly cron). Shows a one-line per-company result afterwards.
// Shown only to a viewer who may run the sync (finance.invoices, ADR 0014);
// the action's own guard is the rule.
export function SyncButton({ may }: { may: MayProp }) {
  return may["finance.invoices"] ? <SyncControl /> : null;
}

function SyncControl() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        const r = await runInvoiceSync();
        setResult(r);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Sync failed.");
      }
    });
  }

  const label = (s: SyncSummary) =>
    s.ok
      ? `${s.entity === "aio" ? "AIO" : "Edge8"}: ${s.upserted} synced` +
        (s.unmappedCount ? `, ${s.unmappedCount} unmapped` : "")
      : `${s.entity === "aio" ? "AIO" : "Edge8"}: ${s.error ?? "failed"}`;

  return (
    <div className="u-stack u-items-end">
      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={run}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {result && (
        <span className="u-sm u-muted u-right">
          {result.map(label).join(" · ")}
        </span>
      )}
      {err && <span className="u-sm u-err">{err}</span>}
    </div>
  );
}
