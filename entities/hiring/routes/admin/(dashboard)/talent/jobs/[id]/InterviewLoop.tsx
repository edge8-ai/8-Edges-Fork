"use client";

import { useState, useTransition } from "react";
import type { InterviewerOption, LoopStep } from "@/entities/hiring/lib/ats/loop";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import {
  addInterviewStep,
  moveInterviewStep,
  removeInterviewStep,
  setInterviewStepInterviewers,
  updateInterviewStep,
} from "./actions";

// The loop editor on a requisition: how many interviews this role puts a
// candidate through, and who runs each. Defined once here, inherited by every
// candidate who reaches the Interview stage, and read by /team/hiring.
//
// Scheduling is not here. A step is the intent ("a technical with the lead engineer"); the
// booked conversation with a time on it lives in company_os.interviews.

type Result = { ok: boolean; error?: string };

export function InterviewLoop({
  reqId,
  steps,
  interviewerOptions,
}: {
  reqId: string;
  steps: LoopStep[];
  interviewerOptions: InterviewerOption[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [newName, setNewName] = useState("");
  const [newDuration, setNewDuration] = useState("60");
  const [newInterviewers, setNewInterviewers] = useState<string[]>([]);

  const run = (fn: () => Promise<Result>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else after?.();
    });
  };

  const totalMinutes = steps.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  return (
    <section className="admin-card admin-section-card u-mt-6">
      <div className="admin-card-title">
        Interview loop{" "}
        <span className="admin-cell-muted">
          ({steps.length} {steps.length === 1 ? "interview" : "interviews"}
          {totalMinutes > 0 ? `, ${totalMinutes} min` : ""})
        </span>
      </div>
      <div className="admin-hint">
        What the Interview stage actually consists of for this role. Every candidate who reaches it
        goes through these, in this order.
      </div>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}

      {steps.length === 0 && (
        <div className="admin-empty">No loop defined. Add the first interview below.</div>
      )}

      {steps.map((step, i) => (
        <StepRow
          key={step.id}
          reqId={reqId}
          step={step}
          index={i}
          isFirst={i === 0}
          isLast={i === steps.length - 1}
          options={interviewerOptions}
          busy={busy}
          run={run}
        />
      ))}

      <div className="admin-form u-mt-4">
        <div className="admin-label">Add an interview</div>
        <div className="u-row-top u-wrap">
          <input
            className="admin-input u-flex-2"
            placeholder="Technical, Founder, Culture…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="Interview name"
          />
          <input
            className="admin-input u-w-120"
            type="number"
            min={5}
            max={480}
            step={5}
            value={newDuration}
            onChange={(e) => setNewDuration(e.target.value)}
            aria-label="Minutes"
          />
          <InterviewerPicker
            options={interviewerOptions}
            selected={newInterviewers}
            onChange={setNewInterviewers}
            disabled={busy}
          />
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy || !newName.trim()}
            onClick={() =>
              run(
                () =>
                  addInterviewStep(
                    reqId,
                    newName,
                    newDuration ? Number(newDuration) : null,
                    newInterviewers,
                  ),
                () => {
                  setNewName("");
                  setNewDuration("60");
                  setNewInterviewers([]);
                },
              )
            }
          >
            Add
          </button>
        </div>
      </div>
    </section>
  );
}

function StepRow({
  reqId,
  step,
  index,
  isFirst,
  isLast,
  options,
  busy,
  run,
}: {
  reqId: string;
  step: LoopStep;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  options: InterviewerOption[];
  busy: boolean;
  run: (fn: () => Promise<Result>, after?: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(step.name);
  const [duration, setDuration] = useState(step.durationMinutes?.toString() ?? "");

  return (
    <div className="admin-loop-step">
      <span className="admin-loop-step-num">{index + 1}</span>

      <div className="admin-loop-step-body">
        {editing ? (
          <div className="u-row u-wrap">
            <input
              className="admin-input u-flex-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Interview name"
            />
            <input
              className="admin-input u-w-90"
              type="number"
              min={5}
              max={480}
              step={5}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              aria-label="Minutes"
            />
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={busy || !name.trim()}
              onClick={() =>
                run(
                  () =>
                    updateInterviewStep(reqId, step.id, name, duration ? Number(duration) : null),
                  () => setEditing(false),
                )
              }
            >
              Save
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                setName(step.name);
                setDuration(step.durationMinutes?.toString() ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="admin-loop-step-head">
              <strong>{step.name}</strong>
              {step.durationMinutes != null && (
                <span className="admin-cell-muted">{step.durationMinutes} min</span>
              )}
            </div>
            <div className="admin-loop-step-people">
              {step.interviewers.length === 0 ? (
                <span className="admin-cell-muted">No interviewer assigned</span>
              ) : (
                step.interviewers.map((iv) => (
                  <span key={iv.personId} className="admin-badge">
                    {iv.name}
                  </span>
                ))
              )}
            </div>
          </>
        )}

        <InterviewerPicker
          options={options}
          selected={step.interviewers.map((i) => i.personId)}
          onChange={(ids) => run(() => setInterviewStepInterviewers(reqId, step.id, ids))}
          disabled={busy}
          compact
        />
      </div>

      <div className="admin-loop-step-actions">
        <button
          type="button"
          className="admin-btn"
          disabled={busy || isFirst}
          onClick={() => run(() => moveInterviewStep(reqId, step.id, "up"))}
          aria-label="Move earlier"
          title="Move earlier"
        >
          ↑
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={busy || isLast}
          onClick={() => run(() => moveInterviewStep(reqId, step.id, "down"))}
          aria-label="Move later"
          title="Move later"
        >
          ↓
        </button>
        {!editing && (
          <button type="button" className="admin-btn" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <ConfirmButton
          label="Remove"
          title={`Remove "${step.name}" from the loop?`}
          body="Candidates who reach the Interview stage from now on skip this step."
          confirmLabel="Remove"
          disabled={busy}
          onConfirm={() => removeInterviewStep(reqId, step.id)}
        />
      </div>
    </div>
  );
}

// A plain multi-select: the sets are two or three people, and a native control
// keeps this keyboard-accessible without a dependency.
function InterviewerPicker({
  options,
  selected,
  onChange,
  disabled,
  compact,
}: {
  options: InterviewerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <select
      className={`admin-input ${compact ? "u-w-full u-mt-2" : "u-w-200"}`}
      multiple
      size={compact ? 3 : 4}
      value={selected}
      disabled={disabled}
      aria-label="Interviewers"
      onChange={(e) =>
        onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
      }
    >
      {options.map((o) => (
        <option key={o.personId} value={o.personId}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
