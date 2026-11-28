"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/kernel/ui/Badge";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { ReviewModel, ReviewReport } from "@/entities/client-programs/lib/client-status/review";
import { describeStep, STATUS_EDIT_ATOM } from "@/entities/client-programs/lib/client-status/steps";
import { draftClientStatusAgain, editClientStatusSummary, makePlainClientStatus } from "./actions";
import { StatusAside, stepTone, type Notice } from "./StatusAside";

// The weekly status page (Z.12, prototype ReviewAfter; Z.12.1): this week's
// draft on the left, what it is and who shares it on the right, earlier weeks
// below. The draft is the stored HTML, rendered as is. It is the account
// owner's: they edit it here and share it with the client themselves, and
// nothing on this page sends it anywhere.

export function StatusReview({ model, may }: { model: ReviewModel; may: MayProp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const current = model.current;
  const canEdit = Boolean(may[STATUS_EDIT_ATOM]);

  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await work();
      setNotice(r.ok ? { tone: "info", text: done } : { tone: "err", text: r.error });
      router.refresh();
    });

  return (
    <div className="admin-status-review">
      {notice && <div className={`admin-alert admin-alert--${notice.tone} admin-alert--lead`} role="status">{notice.text}</div>}
      {!current ? (
        <section className="admin-card admin-section-card">
          <div className="admin-empty">No weekly status yet. The next draft opens on Friday at 10:00 Vietnam time.</div>
        </section>
      ) : current.step === "stopped" ? (
        <section className="admin-card admin-section-card admin-status-stopped" aria-label="The report stopped">
          <div className="admin-approval-eyebrow">
            <Badge tone="err">Stopped</Badge>
            <span className="admin-cell-muted">Week of {current.weekLabel}</span>
          </div>
          <p className="admin-approval-meta">{(current.error ?? "The run stopped without a reason.").replace(/([^.!?])$/, "$1.")} There is no draft this week yet.</p>
          {canEdit && (
            <div className="admin-approval-actions">
              {current.hasFacts && (
                <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => run(() => makePlainClientStatus({ reportId: current.id }), "The plain report is being checked; it appears here as this week's draft once it passes.")}>
                  Use the plain report
                </button>
              )}
              <button type="button" className="admin-btn" disabled={pending} onClick={() => run(() => draftClientStatusAgain({ reportId: current.id }), "Retrying with a fresh start: the driver counts its attempts from zero.")}>
                Retry the draft
              </button>
            </div>
          )}
          <p className="admin-cell-muted u-sm">The plain report is the board and the roadmap with no written summary. It goes through the same check.</p>
        </section>
      ) : (
        <div className="admin-status-grid">
          <StatusPage report={current} canEdit={canEdit && current.step === "ready"} pending={pending} onSaved={(n) => { setNotice(n); router.refresh(); }} />
          <StatusAside report={current} promises={model.promises} may={may} pending={pending} run={run} />
        </div>
      )}
      {model.past.length > 0 && (
        <section className="admin-card admin-section-card u-mt-4" aria-label="Earlier weeks">
          <h2 className="admin-card-title u-mb-3">Earlier weeks</h2>
          {model.past.map((p) => (
            <details key={p.id} className="admin-status-past">
              <summary>
                <span>Week of {p.weekLabel}</span>
                <Badge tone={stepTone(p.step)}>{describeStep(p.step)}</Badge>
              </summary>
              {p.bodyHtml ? <div className="admin-status-page" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} /> : <p className="admin-cell-muted">No draft was made this week.</p>}
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

function StatusPage({ report, canEdit, pending, onSaved }: { report: ReviewReport; canEdit: boolean; pending: boolean; onSaved: (n: Notice) => void }) {
  const [sources, setSources] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(report.plain ? "" : report.summary);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const save = () =>
    startSave(async () => {
      const r = await editClientStatusSummary({ reportId: report.id, version: report.version ?? "", summary: text });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditing(false);
      onSaved({ tone: "info", text: "Saved and checked. This is this week's draft now; share it with the client when you are ready." });
    });

  return (
    <article className="admin-card admin-section-card admin-status-article" aria-label="This week's draft">
      <div className="admin-status-article-bar">
        <span className="admin-approval-subject">Your draft to share with the client</span>
        {report.sections.length > 0 && (
          <button type="button" className="admin-approval-toggle" aria-pressed={sources} onClick={() => setSources(!sources)}>
            {sources ? "Hide sources" : "Show sources"}
          </button>
        )}
      </div>
      <p className="admin-cell-muted u-sm">Nothing here sends it. Read it, edit the summary if it needs it, and share it with the client yourself.</p>
      <h2 className="admin-status-title">{report.title}</h2>
      <p className="admin-cell-muted u-sm">Prepared by Edge8 · {describeStep(report.step)}{report.editedAt ? " · summary edited" : ""}</p>
      {editing && (
        <div className="admin-field">
          <label className="admin-label" htmlFor="status-summary">The summary (the board and roadmap below come from data and are not edited)</label>
          <textarea id="status-summary" className="admin-textarea" rows={4} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} />
          {error && <div className="admin-alert admin-alert--err" role="alert">{error}</div>}
          <div className="admin-approval-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={saving || pending} onClick={save}>Save and check</button>
            <button type="button" className="admin-btn" disabled={saving} onClick={() => { setEditing(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {report.bodyHtml ? (
        <div className="admin-status-page" dangerouslySetInnerHTML={{ __html: report.bodyHtml }} />
      ) : (
        <p className="admin-cell-muted">{describeStep(report.step)}. The draft appears here once it is written; this view refreshes when you reload.</p>
      )}
      {canEdit && !editing && (
        <button type="button" className="admin-btn admin-btn--sm u-mt-2" onClick={() => setEditing(true)}>
          Edit the summary
        </button>
      )}
      {sources && (
        <div className="admin-status-sources" aria-label="Where each line comes from">
          {report.sections.map((s) => (
            <div key={s.key}>
              <h3 className="admin-status-heading">{s.heading}</h3>
              <ul className="admin-status-lines">
                {s.lines.map((l, i) => (
                  <li key={i}>
                    {l.text}
                    <span className="admin-status-source">{l.source}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
