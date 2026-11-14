"use client";

import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { ReviewReport } from "@/entities/client-programs/lib/client-status/review";
import { describeStep, STATUS_EDIT_ATOM, type ClientStatusStep } from "@/entities/client-programs/lib/client-status/steps";
import { draftClientStatusAgain } from "./actions";

// Beside the draft (Z.12, prototype ReviewAfter; Z.12.1): what the draft is,
// who shares it, Draft again, and the checks it passed. There is no Approve,
// Release or Reject: the account owner shares the draft with the client
// themselves, so nothing here decides or sends anything. Draft again shows
// only to a holder of client-programs.status-release; its action refuses
// anyone else anyway.

export type Notice = { tone: "ok" | "info" | "warn" | "err"; text: string };
type Run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => void;

export function stepTone(step: ClientStatusStep): BadgeTone {
  if (step === "ready") return "ok";
  if (step === "stopped") return "err";
  if (step === "superseded") return "neutral";
  return "info";
}

export function StatusAside({ report, promises, may, pending, run }: { report: ReviewReport; promises: string[]; may: MayProp; pending: boolean; run: Run }) {
  const canEdit = Boolean(may[STATUS_EDIT_ATOM]);
  const ready = report.step === "ready";

  const facts: { k: string; v: string }[] = [
    { k: "Who shares it", v: "You, the account owner, with the client, in your own words and channel. Nothing here sends or publishes it." },
    { k: "Drafted by", v: report.plain ? "Nobody: the plain report, from data only" : "The client-status-draft model, class C" },
    ...(report.editedAt ? [{ k: "Summary edited", v: formatDate(report.editedAt) }] : []),
    { k: "Next week", v: "Next Friday's draft opens here; this one stays below it." },
  ];

  return (
    <aside className="admin-status-aside" aria-label="About this draft">
      <section className="admin-card admin-section-card">
        <div className="admin-approval-eyebrow u-mb-3">
          <span className="admin-approval-subject">Weekly client status</span>
          <Badge tone={stepTone(report.step)}>{describeStep(report.step)}</Badge>
        </div>
        <dl className="admin-approval-facts admin-status-facts">
          {facts.map((f) => (
            <div key={f.k} className="admin-approval-fact">
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
        {canEdit && ready && (
          <div className="admin-status-actions">
            <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => draftClientStatusAgain({ reportId: report.id }), "Drafting again. The new draft replaces this one, edits included, once it passes its checks.")}>
              Draft again
            </button>
          </div>
        )}
      </section>
      {ready && (
        <section className="admin-card admin-section-card" aria-label="Checks">
          <h3 className="admin-status-heading">Checks this draft passed</h3>
          <ul className="admin-status-checks">
            {promises.map((p) => (
              <li key={p}>{report.plain && p.startsWith("Every line") ? "No written lines to trace" : p}</li>
            ))}
            <li>Only client-visible cards: internal cards never reached the draft</li>
          </ul>
        </section>
      )}
    </aside>
  );
}
