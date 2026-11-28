"use client";

import { MISSED_MEMBER_PROMPT } from "@/entities/coaching/lib/missed";
import { WRITTEN_MEMBER_PROMPT } from "@/entities/coaching/lib/written";
import { formatDate } from "@/kernel/ui/format";
import { missWorthPrompting, type LeaveSpan } from "@/entities/coaching/lib/leave-window";

// The member's half of "a missed 1-1 asks" (K.36). It says the same thing the
// coach's roster says, in the same words, and offers the two ways out that are
// theirs: asking for another day, which is the K.32 proposal form directly
// below this card, and doing the 1-1 in writing (K.35), which is the
// ninety-second form higher up the same tab.
//
// Deliberately not a red state and deliberately not a count: nobody is behind
// on anything, a day simply went by. The card disappears the moment the coach
// moves the meeting or marks it held.
export function MissedOneOnOne({
  missedOn,
  coachName,
  myLeave = [],
}: {
  missedOn: string | null;
  coachName: string | null;
  // The member's own holidays (L.2). A 1-1 that did not happen because they
  // were away is not a missed 1-1 in any sense worth raising — it is a holiday,
  // and saying "your 1-1 did not happen" about it reads as a fault.
  myLeave?: LeaveSpan[];
}) {
  if (!missWorthPrompting(missedOn, myLeave)) return null;
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">Your 1-1 on {formatDate(missedOn)} did not happen</div>
      <div className="admin-hint">
        {MISSED_MEMBER_PROMPT} {coachName ?? "Your coach"} sees the same line and can move it or mark it held.
      </div>
      <div className="admin-hint">{WRITTEN_MEMBER_PROMPT}</div>
    </section>
  );
}
