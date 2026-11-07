"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runPnlSync } from "./sync-action";
import type { MayProp } from "@/kernel/identity/may-prop";

// "Sync now": rereads every month from QuickBooks (the routine's engine).
// Shown only to a viewer who may run it (finance.pnl, ADR 0014); the action's
// own guard is the rule.
export function PnlSyncButton({ may }: { may: MayProp }) {
  return may["finance.pnl"] ? <SyncControl /> : null;
}

type PnlSyncResult = Awaited<ReturnType<typeof runPnlSync>>;

function SyncControl() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PnlSyncResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    setResult(null);
    start(async () => {
      try {
        setResult(await runPnlSync());
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Sync failed.");
      }
    });
  }

  return (
    <div className="u-stack u-items-end">
      <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={run}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {result && (
        <span className={`u-sm u-right ${result.ok ? "u-muted" : "u-err"}`}>
          {result.ok ? `${result.accounts} accounts over ${result.months} months synced` : result.error ?? "Sync failed."}
        </span>
      )}
      {err && <span className="u-sm u-err">{err}</span>}
    </div>
  );
}
