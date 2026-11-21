"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MayProp } from "@/kernel/identity/may-prop";
import { endMyGoal } from "@/entities/coaching/lib/my-actions";
import { shortDay, type GoalEnding as Ending } from "@/entities/coaching/lib/goal-ending";

// The question an ended goal asks in place of "Got news? Update my number"
// (K.83, prototype https://claude.ai/artifact/5qK41b6KehvywXzyRm8BRS): did it
// land? Three answers, each one press and at most one field. Nothing resolves
// on its own and nothing here counts how often a person answers Missed: the
// question is about the goal, never a score on whoever owns it.

type Step = "ask" | "landed" | "missed" | "extended";

export function GoalEnding({
  may,
  goalId,
  dueDate,
  current,
  suffix,
  coachName,
}: {
  // Hidden without coaching.mine (ADR 0014); endMyGoal's own guard still refuses.
  may: MayProp;
  goalId: string;
  dueDate: string;
  current: number | null;
  /** "of 200 students", beside the final number. */
  suffix: string | null;
  coachName: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("ask");
  const [finalValue, setFinalValue] = useState(current === null ? "" : String(current));
  const [note, setNote] = useState("");
  const [newDate, setNewDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(ending: Ending) {
    setError(null);
    start(async () => {
      const res = await endMyGoal(goalId, ending);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (!may["coaching.mine"]) return null;

  const back = (
    <button type="button" className="coach-ending-back" onClick={() => setStep("ask")} disabled={pending}>
      Back
    </button>
  );

  return (
    <div className={`coach-ending coach-ending--${step}`}>
      {step === "ask" && (
        <>
          <p className="coach-ending-q">Its date was {shortDay(dueDate)}. Did it land?</p>
          <div className="coach-ending-choices">
            <button type="button" className="coach-pill" onClick={() => setStep("landed")}>
              Landed
            </button>
            <button type="button" className="coach-ending-choice" onClick={() => setStep("missed")}>
              Missed
            </button>
            <button type="button" className="coach-ending-choice" onClick={() => setStep("extended")}>
              Extend
            </button>
          </div>
        </>
      )}

      {step === "landed" && (
        <form
          className="coach-ending-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({ kind: "landed", finalValue: finalValue.trim() === "" ? null : Number(finalValue) });
          }}
        >
          <label className="coach-ending-label" htmlFor={`final-${goalId}`}>
            Final number
          </label>
          <div className="coach-ending-row">
            <input id={`final-${goalId}`} className="admin-input coach-progress-input" type="number" min={0} step="any" value={finalValue} onChange={(e) => setFinalValue(e.target.value)} />
            {suffix && <span className="admin-cell-muted">{suffix}</span>}
          </div>
          <p className="coach-ending-hint">Locks the number. The goal moves to your landed goals.</p>
          <div className="coach-ending-row">
            <button type="submit" className="coach-pill" disabled={pending}>
              {pending ? "Saving…" : "Lock it in"}
            </button>
            {back}
          </div>
        </form>
      )}

      {step === "missed" && (
        <form
          className="coach-ending-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({ kind: "missed", note });
          }}
        >
          <label className="coach-ending-label" htmlFor={`why-${goalId}`}>
            In one line, what happened?
          </label>
          <input id={`why-${goalId}`} className="admin-input" type="text" maxLength={200} placeholder="e.g. Launch slipped to November" value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="coach-ending-hint">
            {coachName ? `${coachName} sees it` : "Your coach sees it"} before your next 1-1. It stays on your page.
          </p>
          <div className="coach-ending-row">
            <button type="submit" className="coach-pill" disabled={pending || !note.trim()}>
              {pending ? "Saving…" : "Record it"}
            </button>
            {back}
          </div>
        </form>
      )}

      {step === "extended" && (
        <form
          className="coach-ending-form"
          onSubmit={(e) => {
            e.preventDefault();
            send({ kind: "extended", dueDate: newDate });
          }}
        >
          <label className="coach-ending-label" htmlFor={`date-${goalId}`}>
            New date
          </label>
          <input id={`date-${goalId}`} className="admin-input coach-ending-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <p className="coach-ending-hint">Kept on the goal as &ldquo;extended from {shortDay(dueDate)}&rdquo;.</p>
          <div className="coach-ending-row">
            <button type="submit" className="coach-pill" disabled={pending || !newDate}>
              {pending ? "Saving…" : "Set new date"}
            </button>
            {back}
          </div>
        </form>
      )}

      {error && (
        <p className="admin-hint u-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
