"use client";

// The weekly recap editor (English Program PR 9): the four sections, the
// organiser's own note, Send now and Hold, and the past weeks. Edits save
// while the recap waits; after it is sent the page is a record.
import { useState } from "react";
import Link from "next/link";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { WeeklyRecap } from "@/entities/training/lib/weekly-recap";
import { STEP_LABEL, type WeeklyDraftType } from "@/entities/training/lib/weekly-recap-rules";
import { formatDate } from "@/kernel/ui/format";
import { ActionNote } from "./ActionNote";

export function WeeklyRecapEditor({
  planId,
  week,
  recap,
  names,
  past,
  actions,
}: {
  planId: string;
  week: string;
  recap: WeeklyRecap | null;
  names: Record<string, string>;
  past: { weekStart: string; step: string; label: string }[];
  actions: { edit: (planId: string, week: string, input: unknown) => Promise<Result>; send: (planId: string, week: string) => Promise<Result>; hold: (planId: string, week: string, reason: unknown) => Promise<Result> };
}) {
  const [draft, setDraft] = useState<WeeklyDraftType | null>(recap?.draft ?? null);
  const [note, setNote] = useState(recap?.instructorNote ?? "");
  const [holdReason, setHoldReason] = useState("");
  const [holding, setHolding] = useState(false);
  const { note: msg, pending, run } = useActionRunner();
  const open = recap?.step === "waiting" || recap?.step === "failed";
  const save = () => draft && run(() => actions.edit(planId, week, { draft, instructorNote: note.trim() || null }), "Saved.");
  const sendNow = () =>
    run(async () => {
      if (draft) {
        const saved = await actions.edit(planId, week, { draft, instructorNote: note.trim() || null });
        if (!saved.ok) return saved;
      }
      return actions.send(planId, week);
    }, "Sending now.");
  const hold = () => run(() => actions.hold(planId, week, holdReason), "Held. Dave is told why.", () => setHolding(false));

  return (
    <>
      {!recap && (
        <section className="admin-card admin-section-card tr-card" aria-label="Weekly recap">
          <h2 className="tr-card-title">Not drafted yet</h2>
          <p className="tr-hint">The agent drafts this week on Friday from 16:00 Vietnam time, from the published session recaps, attendance and homework.</p>
        </section>
      )}
      {recap && (
        <section className="admin-card admin-section-card tr-card" aria-label="Weekly recap">
          <div className="tr-card-head">
            <div>
              <h2 className="tr-card-title">{STEP_LABEL[recap.step]}</h2>
              <p className="tr-hint">
                {recap.step === "waiting" && recap.sendAfter ? `Sends ${formatDate(recap.sendAfter)} unless you send or hold it.` : ""}
                {recap.step === "sent" && recap.sentAt ? `Sent ${formatDate(recap.sentAt)} to ${recap.sentTo.map((r) => r.email).join(", ")}.` : ""}
                {recap.step === "held" ? `Held: ${recap.holdReason}` : ""}
                {recap.step === "failed" ? `Last error: ${recap.error}. Retried by the next tick.` : ""}
                {recap.step === "drafting" ? "Claude is drafting it." : ""}
              </p>
            </div>
            {open && (
              <div className="tr-row-actions">
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => setHolding((h) => !h)} disabled={pending}>
                  Hold
                </button>
                <button type="button" className="admin-btn admin-btn--sm" onClick={save} disabled={pending || !draft}>
                  Save edits
                </button>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--primary" onClick={sendNow} disabled={pending || !draft}>
                  Send now
                </button>
              </div>
            )}
          </div>
          <ActionNote note={msg} />
          {holding && open && (
            <div className="admin-form tr-phil-form">
              <label className="admin-field">
                <span className="admin-label">Why hold it</span>
                <input className="admin-input" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} maxLength={1000} placeholder="No session this week; sending next Monday instead." />
              </label>
              <div className="admin-form-actions">
                <button type="button" className="admin-btn admin-btn--primary" onClick={hold} disabled={pending || !holdReason.trim()}>
                  Hold this week
                </button>
              </div>
            </div>
          )}
          {draft && (
            <div className="admin-form tr-phil-form">
              {(["this_week", "attendance", "next_week"] as const).map((k) => (
                <label key={k} className="admin-field">
                  <span className="admin-label">{k === "this_week" ? "This week" : k === "attendance" ? "Attendance and homework" : "Next week"}</span>
                  {open ? <textarea className="admin-textarea" rows={4} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} maxLength={8000} /> : <p className="tr-phil-text">{draft[k]}</p>}
                </label>
              ))}
              <div className="admin-field">
                <span className="admin-label">Progress, per learner</span>
                <p className="tr-hint">Plain words, nothing the learner has not already seen in their own recap line.</p>
                {draft.progress.map((p) => (
                  <label key={p.person_id} className="admin-field">
                    <span className="admin-label">{names[p.person_id] ?? "A learner"}</span>
                    {open ? <textarea className="admin-textarea" rows={3} value={p.md} onChange={(e) => setDraft({ ...draft, progress: draft.progress.map((x) => (x.person_id === p.person_id ? { ...x, md: e.target.value } : x)) })} maxLength={8000} /> : <p className="tr-phil-text">{p.md}</p>}
                  </label>
                ))}
              </div>
              <label className="admin-field">
                <span className="admin-label">Your note · optional</span>
                {open ? <textarea className="admin-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="Add anything the draft missed." /> : <p className="tr-phil-text">{note || "(none)"}</p>}
              </label>
            </div>
          )}
        </section>
      )}
      {past.length > 0 && (
        <section className="admin-card admin-section-card tr-card" aria-label="Past recaps">
          <h2 className="tr-card-title">Past recaps</h2>
          <ul className="tr-log">
            {past.map((p) => (
              <li key={p.weekStart} className="tr-log-row tr-type-1">
                <div>
                  <div className="tr-row-title">
                    <Link href={`/team/training/plans/${planId}/weekly/${p.weekStart}`}>{p.label}</Link>
                  </div>
                  <div className="tr-row-meta">{p.step}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
