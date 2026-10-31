"use client";

import type { Dispatch, SetStateAction } from "react";

export type Step = { title: string; owner: "member" | "coach" };

// Step 3 of marking a session done (K.80): next steps for either person, tied
// to the session when it is saved. The list lives in the panel's state, so a
// refused save keeps it; a step typed but not yet added is sent too.
export function SessionNextSteps({
  name,
  steps,
  setSteps,
  stepTitle,
  setStepTitle,
  stepOwner,
  setStepOwner,
}: {
  name: string;
  steps: Step[];
  setSteps: Dispatch<SetStateAction<Step[]>>;
  stepTitle: string;
  setStepTitle: (v: string) => void;
  stepOwner: Step["owner"];
  setStepOwner: (v: Step["owner"]) => void;
}) {
  const addStep = () => {
    if (!stepTitle.trim()) return;
    setSteps((s) => [...s, { title: stepTitle.trim(), owner: stepOwner }]);
    setStepTitle("");
  };

  return (
    <div className="coach-done-step">
      <span className="coach-picker-label">
        3 · Next steps <span className="coach-optional">optional · you both see them</span>
      </span>
      {steps.length > 0 && (
        <ul className="coach-promise-list">
          {steps.map((s, i) => (
            <li key={`${s.title}-${i}`} className="coach-promise">
              <span className="coach-promise-title">{s.title}</span>
              <span className="coach-promise-meta">{s.owner === "member" ? name : "You"}</span>
              <button
                type="button"
                className="admin-btn admin-btn--sm admin-btn--ghost"
                aria-label={`Remove ${s.title}`}
                onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="coach-promise-add">
        <input
          className="admin-input"
          aria-label="A next step"
          placeholder="Add a next step…"
          value={stepTitle}
          onChange={(e) => setStepTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addStep();
            }
          }}
        />
        <select
          className="admin-input"
          aria-label="Whose step"
          value={stepOwner}
          onChange={(e) => setStepOwner(e.target.value as Step["owner"])}
        >
          <option value="member">{name}&apos;s</option>
          <option value="coach">Mine</option>
        </select>
        <button type="button" className="admin-btn" disabled={!stepTitle.trim()} onClick={addStep}>
          Add
        </button>
      </div>
    </div>
  );
}
