"use client";

import { useId, useState, useTransition } from "react";
import { addDays } from "@/kernel/config/dates";
import { completeSession } from "@/entities/coaching/lib/meeting-actions";
import { dayLabel } from "@/entities/coaching/lib/day-choices";
import { describeDay } from "@/entities/coaching/lib/cadence";
import {
  SESSION_FORMATS,
  SESSION_FORMAT_LABELS,
  type SessionFormat,
  type SessionWhich,
} from "@/entities/coaching/lib/session-done";

import { SessionNextSteps, type Step } from "./SessionNextSteps";
import { SessionRecording } from "./SessionRecording";

// Mark a coaching session done, whenever the coach likes and however the two
// of them met (K.80). Three steps, only the first required:
//   1. which session it was, and when — the one thing code cannot guess;
//   2. a note for the employee and a private one for the coach;
//   3. next steps for either of them.
// The employee is then asked for their own FAST goal update or reflection;
// the coach never writes it for them (self-reported growth, Khoa's rule).
export function MarkSessionDone({
  profileId,
  name,
  todayIso,
  passedDay,
  bookedDay,
  onClose,
  onDone,
}: {
  profileId: string;
  name: string;
  todayIso: string;
  // A booking whose day went by unanswered: "it was that one" closes it on
  // its own day, so no date is asked.
  passedDay: string | null;
  // The booking still ahead, if any: the coach says whether this was it.
  bookedDay: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const yesterday = addDays(todayIso, -1);
  const pending = passedDay ?? bookedDay;
  const [which, setWhich] = useState<SessionWhich>("booked");
  const [day, setDay] = useState(todayIso);
  const [earlier, setEarlier] = useState(false);
  const [format, setFormat] = useState<SessionFormat | null>(null);
  const [note, setNote] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepTitle, setStepTitle] = useState("");
  const [stepOwner, setStepOwner] = useState<Step["owner"]>("member");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // Closing a passed booking keeps its day; every other path records the day
  // the coach picks.
  const asksDay = !(passedDay && which === "booked");

  const submit = () => {
    if (busy || (asksDay && !day)) return;
    setError(null);
    startTransition(async () => {
      let res;
      try {
        res = await completeSession(profileId, {
          day: asksDay ? day : (passedDay as string),
          which: pending ? which : "extra",
          note,
          privateNote,
          format,
          // A step typed but not yet added still counts: the coach meant it.
          steps: stepTitle.trim() ? [...steps, { title: stepTitle.trim(), owner: stepOwner }] : steps,
          minutesUrl,
          transcript,
        });
      } catch {
        res = { ok: false as const, error: "That did not go through. Try again." };
      }
      if (!res.ok) setError(res.error);
      else onDone();
    });
  };

  return (
    <section className="coach-done" aria-labelledby={`${id}-title`}>
      <div className="coach-done-head">
        <h3 className="coach-done-title" id={`${id}-title`}>
          Mark a session done
        </h3>
        <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p className="coach-done-lede">Video, a call, a coffee or a chat thread all count. Only the first step is needed.</p>

      <div className="coach-done-step">
        <span className="coach-picker-label">1 · Which session was it?</span>
        {pending && (
          <div className="coach-choice-grid" role="radiogroup" aria-label="Which session was it?">
            <button
              type="button"
              role="radio"
              aria-checked={which === "booked"}
              className="coach-choice"
              onClick={() => setWhich("booked")}
            >
              <span className="coach-choice-title">
                {passedDay ? `The ${describeDay(passedDay)} session` : `Our ${describeDay(pending)} session`}
              </span>
              <span className="coach-choice-note">
                {passedDay ? "It happened; mark it done" : "We met sooner; it moves to the day you pick"}
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={which === "extra"}
              className="coach-choice"
              onClick={() => setWhich("extra")}
            >
              <span className="coach-choice-title">An extra conversation</span>
              <span className="coach-choice-note">
                {passedDay ? "Record this one; deal with that day later" : `Keep ${describeDay(pending)} booked`}
              </span>
            </button>
          </div>
        )}
        <div className="coach-done-row">
          {asksDay && (
            <div className="coach-chips" role="group" aria-label="When did you meet?">
              {[todayIso, yesterday].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="coach-chip"
                  aria-pressed={!earlier && day === d}
                  onClick={() => {
                    setEarlier(false);
                    setDay(d);
                  }}
                >
                  {dayLabel(d, todayIso)}
                </button>
              ))}
              <button type="button" className="coach-chip" aria-pressed={earlier} onClick={() => setEarlier(true)}>
                Earlier…
              </button>
              {earlier && (
                <input
                  className="admin-input coach-picker-native"
                  type="date"
                  aria-label="The day you met"
                  max={todayIso}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="coach-chips" role="group" aria-label="How did you meet? Optional">
            <span className="coach-done-how">How</span>
            {SESSION_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                className="coach-chip coach-chip--pill"
                aria-pressed={format === f}
                onClick={() => setFormat((cur) => (cur === f ? null : f))}
              >
                {SESSION_FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="coach-done-cols">
        <div className="coach-done-step">
          <label className="coach-picker-label" htmlFor={`${id}-note`}>
            2 · A note for {name} <span className="coach-optional">optional · they see it</span>
          </label>
          <textarea
            id={`${id}-note`}
            className="admin-input coach-done-note"
            rows={4}
            value={note}
            placeholder="What you talked about, what you noticed, what you will do for them."
            onChange={(e) => setNote(e.target.value)}
          />
          <label className="coach-picker-label" htmlFor={`${id}-private`}>
            Private note <span className="coach-optional">optional · only you</span>
          </label>
          <input
            id={`${id}-private`}
            className="admin-input"
            value={privateNote}
            placeholder="Something to remember for next time."
            onChange={(e) => setPrivateNote(e.target.value)}
          />
        </div>

        <SessionNextSteps
          name={name}
          steps={steps}
          setSteps={setSteps}
          stepTitle={stepTitle}
          setStepTitle={setStepTitle}
          stepOwner={stepOwner}
          setStepOwner={setStepOwner}
        />
      </div>

      <SessionRecording
        minutesUrl={minutesUrl}
        setMinutesUrl={setMinutesUrl}
        transcript={transcript}
        setTranscript={setTranscript}
      />

      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="coach-done-foot">
        <p className="admin-hint">{name} is then asked to update their FAST goal or write a short reflection: their words, not yours.</p>
        <button type="button" className="admin-btn admin-btn--growth" disabled={busy || (asksDay && !day)} onClick={submit}>
          {busy ? (transcript.trim() ? "Saving and drafting the recap…" : "Saving…") : "Mark done"}
        </button>
      </div>
    </section>
  );
}
