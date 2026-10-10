"use client";

import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { holdOneOnOneInWriting, markOneOnOneHeld } from "@/entities/coaching/lib/schedule-actions";
import { MISSED_COACH_PROMPT } from "@/entities/coaching/lib/missed";
import { missWorthPrompting, type LeaveSpan } from "@/entities/coaching/lib/leave-window";
import { type ActionResult } from "./shared";

// A missed 1-1 asks (K.36). The day after a booking went by, this sits at the
// top of that meeting's body with the four ways out, worded as a question the
// coach answers rather than a state the page asserts about anybody. There is
// no count in it, no red and no "overdue": the meeting did not happen, which
// is a fact about a day, not about a person (CLAUDE.md).
//
// Only one of the four choices is a button of its own. Move and Skip are the
// forms already below this block, so the prompt names them rather than growing
// a second Move and a second Skip, and "do it in writing" is the summary block
// below until K.35 gives that exit its own home.
export function MissedPrompt({
  m,
  run,
  busy,
  memberLeave = [],
}: {
  m: OneOnOne;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
  // When this member was away (L.2). A 1-1 that did not happen because they
  // were on holiday is not a missed 1-1 in any sense worth putting in front of
  // their coach — and the coach is the one who might otherwise chase.
  memberLeave?: LeaveSpan[];
}) {
  // Only a booking that was stamped as missed and is still a booking asks
  // anything: marking it held, moving it or skipping it all answer the prompt.
  if (m.outcome !== "passed-unheld") return null;
  if (!missWorthPrompting(m.heldOn, memberLeave)) return null;

  return (
    <div className="admin-coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">This 1-1 did not happen</span>
      </div>
      <p className="admin-cell-muted">{MISSED_COACH_PROMPT}</p>
      <div className="admin-form-actions">
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() => run("Mark held", () => markOneOnOneHeld(m.id))}
        >
          Mark it held
        </button>
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy}
          onClick={() => run("Held in writing", () => holdOneOnOneInWriting(m.id))}
        >
          Do it in writing
        </button>
      </div>
      <div className="admin-hint">
        Move it or skip it with the forms below. In writing means their answers above plus your note back count as
        the 1-1; save the note first.
      </div>
    </div>
  );
}
