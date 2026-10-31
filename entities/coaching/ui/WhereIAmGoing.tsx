"use client";

import Link from "next/link";
import { SharedBet } from "./SharedBet";
import type { SharedGoal } from "@/entities/coaching/client";
import { useId, useState } from "react";
import type { LadderRung } from "@/entities/coaching/lib/data/member-ladder";
import { bumpsCaption } from "@/entities/coaching/lib/goal-bumps";
import { targetSuffix } from "@/entities/coaching/lib/goal-measure";
import { CompanyRungMove } from "./CompanyRungMove";
import { GoalProgress } from "./GoalProgress";

// "Where I am going" (K.16, spec 2.1), drawn as an ascent since K.29: one path
// climbing from the company objective up through the key result to the goal
// rung, which is lifted and filled in the growth hue, and on to the next rung,
// which is a direction and never a promise. A rung clicks open to one paragraph.
//
// Below the climb, the goal chain (K.25): the goals of earlier quarters as
// muted steps at the foot of the same path, each saying which quarter it was
// and how it ended. History, never a tally.
//
// The empty state draws the same path unfilled with one sentence, so a member
// with no goal yet sees the shape of what the page becomes rather than a
// frame asking to be filled (K.27 adds the worked example beneath it).
//
// Nothing here describes the person: the number is the goal's own measure,
// and the copy is about the goal.

const RUNG_EYEBROW: Record<LadderRung["kind"], string> = {
  objective: "The company bet",
  key_result: "What my goal feeds",
  goal: "My goal",
  next: "After this",
  // A past goal (K.25) writes its own eyebrow — the quarter it belonged to and
  // how it ended — so the kind only supplies the fallback.
  past: "Earlier",
};

// The shape the empty ascent draws: the steps up to the goal, with nothing on
// them. The next rung appears once the first goal is saved (K.30).
const EMPTY_STEPS: LadderRung["kind"][] = ["objective", "key_result", "goal"];

function Display({ rung }: { rung: LadderRung }) {
  if (rung.currentValue === null) return null;
  // How often the number moved this quarter (K.42). A fact about the goal's
  // upkeep, hidden entirely at zero so an untouched goal is never scolded.
  const caption = bumpsCaption(rung.bumpsThisQuarter ?? 0);
  const suffix = targetSuffix({ target: rung.targetValue, unit: rung.unit, direction: rung.direction ?? "up" });
  return (
    <div className="coach-display-block">
      <div className="coach-display" aria-hidden="true">
        <span className="coach-display-number">{rung.currentValue}</span>
        {suffix && <span className="coach-display-of">{suffix}</span>}
      </div>
      {caption && <div className="coach-display-caption">{caption}</div>}
    </div>
  );
}

export function WhereIAmGoing({
  rungs,
  sample = false,
  sharedGoals = [],
  onAddTarget,
}: {
  rungs: LadderRung[];
  sample?: boolean;
  // Other people lifting the same key result (L.5). Their own prop rather than
  // a field on the rung: the rung describes the climb, and this describes who
  // else is on it. Empty on the worked example, which has no real colleagues.
  sharedGoals?: SharedGoal[];
  // Where the goal rung's "Add a target" goes when the goal has none: the tab
  // that holds the goal's edit form.
  onAddTarget?: () => void;
}) {
  const empty = rungs.length === 0;
  // On a phone the ascent is the tallest thing on the page, so under 480px it
  // starts collapsed behind a Show button and the rest of the page is reachable
  // without scrolling past it. Which width is which is decided in CSS and not
  // here (K.52, critique §A.6): resolving the media query in an effect made the
  // block disappear one frame after first paint, which is a layout shift a
  // member sees on every visit. This state only records that the member opened
  // it, so the first paint is right at every width.
  const [open, setOpen] = useState(false);
  const listId = useId();
  // The ascent steps right as it climbs: each rung sits a little further along
  // than the one below it, so the list reads as a path rather than a stack.
  // The four steps of the climb are the ladder's own rungs; the goal chain
  // (K.25) hangs off the foot of the same path, every past goal at step 0, so
  // the history reads as where the path came from rather than as more climb.
  let step = 0;
  const steps = empty
    ? EMPTY_STEPS.map((kind) => ({ kind, rung: null as LadderRung | null, step: step++ }))
    : rungs.map((rung) => ({
        kind: rung.kind,
        rung,
        // A past goal sits at the step the current goal takes: the same rung of the
        // path, an earlier quarter on it.
        step: rung.kind === "past" ? Math.min(step, 3) : Math.min(step++, 3),
      }));

  return (
    <section className="admin-card admin-coach-section coach-ascent-card">
      <div className="admin-card-title">
        Where this takes us
        {sample && <span className="admin-badge">Example</span>}
      </div>
      <div className="admin-hint">
        {sample
          ? "This is what the page looks like once you have a goal. Nothing here is yours yet."
          : empty
            ? "One goal is the first rung. Write it on the My goal tab and this path fills in."
            : <>Your goal lifts a company bet. The whole tree is on <Link href="/team/company-goals">Company goals</Link>.</>}
      </div>

      {/* The toggle is hidden above 480px in CSS, so a member who widens the
          window while it is folded still sees the ladder — and because it is
          display:none there, its aria-expanded never describes a ladder that
          is in fact open. */}
      <button
        type="button"
        className="admin-link-btn coach-ascent-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? "Hide" : "Show the ladder"}
      </button>

      <ol
        id={listId}
        className={`coach-ascent coach-ascent--phone-collapsible${empty ? " coach-ascent--empty" : ""}${
          sample ? " coach-ascent--sample" : ""
        }${open ? " is-open" : ""}`}
      >
        {steps.map(({ kind, rung, step: at }, i) => (
          <li key={`${kind}-${i}`} className={`coach-rung coach-rung--${kind} coach-rung--step-${at}`}>
            <span className="coach-rung-dot" aria-hidden="true" />
            <div className="coach-rung-body">
              <span className="admin-eyebrow">{rung?.eyebrow || RUNG_EYEBROW[kind]}</span>
              {rung ? (
                <>
                  {kind === "goal" && <Display rung={rung} />}
                  {/* The company rung shows its own number and what it did
                      since the last 1-1 (K.43), which is what makes the rung
                      above the goal worth looking at. */}
                  {kind === "key_result" && rung.currentValue !== null && (
                    <CompanyRungMove
                      current={rung.currentValue}
                      target={rung.targetValue}
                      unit={rung.unit}
                      move={rung.move ?? null}
                      direction={rung.direction ?? "up"}
                    />
                  )}
                  {/* Who else is climbing this one (L.5). On the key-result
                      rung because that is the thing actually shared — the goal
                      above it is each person's own. */}
                  {kind === "key_result" && <SharedBet goals={sharedGoals} />}
                  {rung.detail ? (
                    <details className="coach-rung-detail">
                      <summary>
                        <strong>{rung.label}</strong>
                      </summary>
                      <p className="admin-cell-muted">{rung.detail}</p>
                    </details>
                  ) : (
                    <div>
                      <strong>{rung.label}</strong>
                    </div>
                  )}
                  {/* The member's own goal rung hands its bar to GoalProgress,
                      which animates the fill from the old share of the way to
                      the new one on a bump (K.42). Every other rung keeps the
                      native <progress>, which needs no motion. */}
                  {rung.progressPct !== null && !(kind === "goal" && rung.goalId && !sample) && (
                    // A native <progress>: the bar is data-driven and carries its
                    // value for a screen reader without a style attribute.
                    <progress
                      className="coach-rung-bar"
                      value={rung.progressPct}
                      max={100}
                      aria-label={`${rung.progressPct}% of target`}
                    />
                  )}
                  {/* The measure line repeats the display number on the goal rung, so it
                      only shows where there is no display. */}
                  {rung.measure && rung.currentValue === null && <div className="admin-cell-muted">{rung.measure}</div>}
                  {kind === "goal" && rung.goalId && !sample && (
                    <GoalProgress
                      goalId={rung.goalId}
                      current={rung.currentValue}
                      start={rung.startValue ?? null}
                      target={rung.targetValue}
                      unit={rung.unit}
                      pct={rung.progressPct}
                      onAddTarget={onAddTarget}
                    />
                  )}
                </>
              ) : (
                <span className="coach-rung-blank" aria-hidden="true" />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
