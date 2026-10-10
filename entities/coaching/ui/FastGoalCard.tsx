"use client";

import { useState } from "react";
import { GOAL_STATUS_LABELS } from "@/entities/coaching/lib/types";
import { bumpsCaption, lastBumpCaption } from "@/entities/coaching/lib/goal-bumps";
import { goalDirection, specificTarget, targetSuffix } from "@/entities/coaching/lib/goal-measure";
import { goalProgressPct } from "@/entities/coaching/lib/goal-percent";
import type { MyGoalRow } from "@/entities/coaching/lib/my-goal-row";
import type { Result } from "@/kernel/data/result";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { formatDate } from "@/kernel/ui/format";
import { GoalComments } from "./GoalComments";
import { GoalProgress } from "./GoalProgress";
import { GoalLetter } from "./GoalLetter";

// One FAST goal as a card (K.62). The tab used to be the admin skin — a blue
// chip, a measure line in muted grey, an Edit/Delete row and the discussion in
// a separate block further down — and Khoa's verdict was that the method the
// goal is built on could not be read off the screen at all.
//
// So the card IS the method. One dominant element (ui-ux-pro-max priority 6,
// a single modular scale: exactly one display-size number per view) — the
// goal's own number over the mint bar — and under it the four letters as four
// short labelled lines, each carrying the one fact that letter is about. The
// discussion sits on the F line behind a disclosure rather than open, and Edit
// and Delete sit behind a "…" menu rather than in the reading order:
// ui-ux-pro-max priority 8, "progressive disclosure", against the anti-pattern
// "overwhelm upfront".
//
// The bar, the bump and the moment are GoalProgress', shared with the Today
// ladder's goal rung, and the number uses the rung's own `.coach-display`
// classes, so the two screens are the same object seen twice.

function Fast({ letter, word, children }: { letter: string; word: string; children: React.ReactNode }) {
  return (
    <div className="coach-fast-row">
      <span className="coach-fast-key" aria-hidden="true">
        {letter}
      </span>
      <div className="coach-fast-body">
        <span className="coach-fast-word">{word}</span>
        <div className="coach-fast-value">{children}</div>
      </div>
    </div>
  );
}

export function FastGoalCard({
  goal,
  coachName,
  todayISO,
  busy,
  onEdit,
  onDelete,
  onDeleted,
}: {
  goal: MyGoalRow;
  // Who set it, when someone else did. Null when the member has no coach on
  // file, in which case the footer says only that it was set for them.
  coachName: string | null;
  // The page's Saigon today, so "bumped Monday" is the same day the rest of
  // the cycle counts in and not the browser's timezone.
  todayISO: string;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => Promise<Result>;
  onDeleted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pct = goalProgressPct(goal);
  const direction = goalDirection(goal.startValue, goal.targetValue);
  const suffix = targetSuffix({ target: goal.targetValue, unit: goal.metricUnit, direction });
  const adjusted = bumpsCaption(goal.bumps);
  const lastBump = lastBumpCaption(goal.lastBumpAt, todayISO);

  // The S line: what is measured, what it has to reach, and by when. Each part
  // is dropped when the goal does not carry it, so a goal with only a target
  // still reads as a sentence rather than as a row of dashes.
  const specific = [
    specificTarget({ start: goal.startValue, target: goal.targetValue, unit: goal.metricUnit }),
    goal.metricUnit && goal.targetValue === null ? `measured in ${goal.metricUnit}` : null,
    goal.dueDate ? `by ${formatDate(goal.dueDate)}` : null,
  ].filter(Boolean);

  return (
    <article className="admin-card coach-goal-card">
      <div className="coach-goal-card-head">
        <div className="coach-goal-card-heading">
          <span className="admin-eyebrow coach-goal-card-eyebrow">
            {GOAL_STATUS_LABELS[goal.status]}
            {goal.quarterLabel ? ` · ${goal.quarterLabel}` : ""}
          </span>
          <h3 className="coach-goal-card-title">{goal.title}</h3>
        </div>
        <div className="coach-goal-card-menu-wrap">
          <button
            type="button"
            className="coach-goal-card-menu-btn"
            aria-label={`Change "${goal.title}"`}
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="coach-goal-card-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="coach-goal-card-menu-item"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                Edit this goal
              </button>
              {/* A goal a coach set is theirs to remove, so the menu does not
                  offer a Delete that would only ever come back refused. */}
              {goal.canDelete && (
                <ConfirmButton
                  label="Delete this goal"
                  className="coach-goal-card-menu-item"
                  title={`Delete "${goal.title}"?`}
                  body="Your manager is notified."
                  confirmLabel="Delete"
                  disabled={busy}
                  onConfirm={onDelete}
                  onDone={() => {
                    setMenuOpen(false);
                    onDeleted();
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {goal.currentValue !== null && (
        <div className="coach-display-block">
          <div className="coach-display" aria-hidden="true">
            <span className="coach-display-number">{goal.currentValue}</span>
            {suffix && <span className="coach-display-of">{suffix}</span>}
          </div>
          {adjusted && <div className="coach-display-caption">{adjusted}</div>}
        </div>
      )}

      {/* The bar, the moment and the bump control, shared with the Today
          ladder. On this tab the pill is drawn as a line rather than a filled
          one (CSS only): a tab can hold several goals, and several filled mint
          pills would be several things claiming to be the page's one action. */}
      <GoalProgress
        goalId={goal.id}
        current={goal.currentValue}
        start={goal.startValue}
        target={goal.targetValue}
        unit={goal.metricUnit}
        pct={pct}
        onAddTarget={onEdit}
      />

      {/* The letter to your end-of-quarter self (L.10). Under the number and
          above the F/A/S/T rows: setting the goal is the only moment you
          genuinely have something to say to whoever lives the quarter. */}
      <GoalLetter goalId={goal.id} hasLetter={goal.hasLetter} sealedOn={goal.letterSealedOn} todayISO={todayISO} />

      <div className="coach-fast">
        <Fast letter="F" word="Frequent">
          <GoalComments goalId={goal.id} comments={goal.comments} />
          {lastBump && <span className="coach-fast-aside">{lastBump}</span>}
        </Fast>
        {/* Each letter means what the goal form's checks say it means
            (lib/fast-checks.ts). A is the stretch, the answer to "what would
            doubling it look like?". Until 2026-10-06 this row carried the
            company goal instead, so goals sharing a key result all read the
            same ambition, and the stretch a member wrote appeared nowhere. */}
        <Fast letter="A" word="Ambitious">
          {goal.stretchMarkdown?.trim() ? (
            <span className="coach-fast-stretch">{goal.stretchMarkdown.trim()}</span>
          ) : (
            <span className="admin-cell-muted">What would doubling it look like? Edit the goal to add it.</span>
          )}
        </Fast>
        <Fast letter="S" word="Specific">
          {specific.length ? (
            <span>{specific.join(" · ")}</span>
          ) : (
            <span className="admin-cell-muted">No number on it yet — edit the goal to add one.</span>
          )}
        </Fast>
        {/* T is the company goal it lifts, which everyone can see, and who
            else can see this one. */}
        <Fast letter="T" word="Transparent">
          {goal.ladderLabel ? (
            <>
              <span>Lifts {goal.ladderLabel}</span>
              {goal.alignMeasure && <span className="coach-fast-aside">{goal.alignMeasure}</span>}
            </>
          ) : (
            <span className="admin-cell-muted">Not linked to a company goal yet.</span>
          )}
          <span className="coach-fast-aside coach-fast-who">
            {goal.canDelete ? "Set by you" : coachName ? `Set with ${coachName}` : "Set for you"}. Your coach and
            your team can see it and comment.
          </span>
        </Fast>
      </div>
    </article>
  );
}
