"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runRollup } from "./actions";

// Manual roll-up trigger. "Previous month" mirrors the monthly cron;
// "this month" pulls already-accepted work forward for testing/off-cycle.
export function RollupButtons() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(which: "previous" | "current") {
    setMessage(null);
    startTransition(async () => {
      const r = await runRollup(which);
      if (!r.ok) {
        setMessage(`Roll-up failed: ${r.error}`);
        return;
      }
      const s = r.summary!;
      setMessage(
        `Roll-up for ${s.period}: ${s.created} created, ${s.updated} updated, ${s.requestsLinked} work items linked.` +
          (s.skipped.length ? ` Skipped — ${s.skipped.join("; ")}` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="u-row u-wrap">
      {message && <span className="admin-cell-muted u-sm">{message}</span>}
      <button type="button" className="admin-btn" onClick={() => run("previous")} disabled={pending}>
        {pending ? "Running…" : "Roll up last month"}
      </button>
      <button type="button" className="admin-btn" onClick={() => run("current")} disabled={pending}>
        Roll up this month
      </button>
    </div>
  );
}
