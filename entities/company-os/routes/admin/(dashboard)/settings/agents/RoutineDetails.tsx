"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { badgeClass, type AgentRow, type SendLine } from "@/entities/company-os/lib/agent-rows";
import { settleSend } from "./actions";

// A routine's details on Settings -> Agents (Y.25): its last runs, and what it
// sent this week through the effect ledger (company_os.automation_effects,
// Z.1). A send whose run ended before the provider answered is unknown, and no
// run repeats it until a person says what happened: the runbook's resolution,
// as two buttons. The full history, with each run's result and log, stays on
// the routine's own page.

export type PendingRun = { at: string };

function SendItem({ send, may }: { send: SendLine; may: MayProp }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const settle = (outcome: "done" | "released") =>
    start(async () => {
      setError(null);
      try {
        const res = await settleSend({ effectId: send.id, outcome });
        if (!res.ok) setError(res.error);
      } catch {
        // Caught, so a dropped request leaves the page standing and says so.
        setError("The server did not answer. Reload the page to see whether it was recorded.");
      }
    });
  return (
    <li className={`admin-agents-send${send.unknown ? " admin-agents-send--unknown" : ""}`}>
      <div className="admin-agents-send-line">
        <span className={badgeClass(send.tone)}>{send.word}</span>
        <span className="admin-agents-wrap">{send.what}</span>
      </div>
      {send.unknown ? (
        <div className="admin-agents-settle">
          <span className="admin-agents-settle-hint">{send.hint}</span>
          {may["company-os.routine-control"] ? (
            <>
              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => settle("done")}>
                It was sent
              </button>
              <button type="button" className="admin-btn admin-btn--sm" disabled={pending} onClick={() => settle("released")}>
                It was not: send on the next run
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="admin-agents-note u-err">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function RoutineDetails({ row, may, pending }: { row: AgentRow; may: MayProp; pending: PendingRun | null }) {
  return (
    <div className="admin-agents-details">
      <div className="admin-agents-col">
        <h3 className="admin-agents-h3">Last runs</h3>
        {row.runs.length === 0 && !pending ? (
          <p className="admin-agents-empty">No run recorded yet.</p>
        ) : (
          <ol className="admin-agents-runs">
            {pending ? (
              <li className="admin-agents-run-line">
                <span className={badgeClass("info")}>Running</span>
                <span className="admin-agents-run-at">{pending.at}</span>
                <span className="admin-agents-wrap">started by you (Run now)</span>
              </li>
            ) : null}
            {row.runs.map((run) => (
              <li key={run.id} className="admin-agents-run-line">
                <span className={badgeClass(run.tone)}>{run.word}</span>
                <span className="admin-agents-run-at">{run.at}</span>
                <span className="admin-agents-wrap">{run.text}</span>
              </li>
            ))}
          </ol>
        )}
        <Link href={`/admin/settings/agents/${encodeURIComponent(row.id)}`} className="admin-agents-more">
          Every run, with its result and log
        </Link>
      </div>
      <div className="admin-agents-col">
        <h3 className="admin-agents-h3">What it sent this week</h3>
        {row.sends.length === 0 ? (
          <p className="admin-agents-empty">Nothing sent through the effect ledger.</p>
        ) : (
          <ul className="admin-agents-sends">
            {row.sends.map((s) => (
              <SendItem key={s.id} send={s} may={may} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
