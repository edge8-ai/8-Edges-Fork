"use client";

// What needs the learner on My Training (English Program PR 4): homework due,
// with the submitter, and a session the transcript set attendance for, to
// confirm or correct in one tap. The cool-down tray below keeps the member's
// own word and review as before.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import type { MyHomework } from "@/entities/training/lib/assignments";
import { whenLabel } from "@/entities/training/lib/training-format";
import { ActionNote } from "./ActionNote";
import { SubmitHomework, type HomeworkActions } from "./SubmitHomework";
import { SubmissionLine } from "./SubmissionLine";

export type AttendanceToConfirm = { trainingId: string; title: string; startsAt: string; endsAt: string; status: "attended" | "absent" };

export function NeedsYou({
  homework,
  attendance,
  actions,
}: {
  homework: MyHomework[];
  attendance: AttendanceToConfirm[];
  actions: HomeworkActions & { confirm: (trainingId: string, status: "attended" | "absent") => Promise<Result>; open: (path: string) => Promise<{ ok: true; url: string } | { ok: false; error: string }> };
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { note, pending, run } = useActionRunner();
  if (homework.length === 0 && attendance.length === 0) return null;
  return (
    <section className="tr-cool" aria-labelledby="tr-needs-h">
      <div className="tr-card-head">
        <h2 className="tr-card-title" id="tr-needs-h">
          Needs you
        </h2>
      </div>
      <ActionNote note={note} />
      <ul className="tr-cool-list">
        {attendance.map((a) => (
          <li key={a.trainingId} className="tr-word tr-type-1">
            <div className="tr-word-head">
              <div className="tr-cool-main">
                <div className="tr-row-title">{a.title}</div>
                <div className="tr-row-meta">
                  {whenLabel(a.startsAt, a.endsAt)} · were you there? The transcript says {a.status === "attended" ? "yes" : "no"}.
                </div>
              </div>
              <div className="tr-cool-actions">
                <button type="button" className="admin-btn admin-btn--sm tr-btn-ink" onClick={() => run(() => actions.confirm(a.trainingId, "attended"), "Noted: you were there.")} disabled={pending}>
                  Yes
                </button>
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => run(() => actions.confirm(a.trainingId, "absent"), "Noted: you were not.")} disabled={pending}>
                  No
                </button>
              </div>
            </div>
          </li>
        ))}
        {homework.map((h) => (
          <li key={h.assignment.id} className="tr-word tr-type-2">
            <div className="tr-word-head">
              <div className="tr-cool-main">
                <div className="tr-row-title">Homework due {whenLabel(h.assignment.dueAt, h.assignment.dueAt).split(" · ").slice(0, 2).join(" · ")}</div>
                <div className="tr-row-meta">
                  {h.sessionTitle} · {h.assignment.prompt}
                </div>
                {h.submission && (
                  <div className="tr-row-meta">
                    Submitted: <SubmissionLine submission={h.submission} open={actions.open} />
                  </div>
                )}
              </div>
              <div className="tr-cool-actions">
                <button type="button" className={`admin-btn admin-btn--sm${h.submission ? "" : " tr-btn-ink"}`} onClick={() => setOpenId(openId === h.assignment.id ? null : h.assignment.id)}>
                  {openId === h.assignment.id ? "Close" : h.submission ? "Resubmit" : "Submit"}
                </button>
              </div>
            </div>
            {openId === h.assignment.id && (
              <div className="tr-word-panel">
                <SubmitHomework assignmentId={h.assignment.id} accepts={h.assignment.accepts} actions={actions} onDone={() => setOpenId(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
