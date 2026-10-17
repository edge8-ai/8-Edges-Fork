"use client";

import { moveLine } from "@/entities/coaching/lib/history-shared";
import { formatDate } from "@/kernel/ui/format";
import type { HistoryMeetingView } from "./MyHistory";

// What the member wrote before a 1-1, and what happened to the meeting itself
// — the block a timeline row expands into (K.33).
//
// Split out of MyHistory.tsx, which sits at the 250-line client-component cap
// now that the timeline carries group sessions and noticed sentences as well as
// meetings. It was always a self-contained thing: three optional answers plus
// the two sentences that explain a meeting which moved or did not happen.

export function Answers({ m }: { m: HistoryMeetingView }) {
  const rows: [string, string | null][] = [
    ["What moved", m.movedMd],
    ["What was stuck", m.stuckMd],
    ["What I wanted to talk about", m.talkMd],
  ];
  const written = rows.filter(([, body]) => body?.trim());
  // The move line belongs with the answers because it is the other thing that
  // happened before the meeting, and because this block is already the one
  // place the timeline row expands into (K.33).
  const moved = moveLine(m.movedFrom, m.moveReason, formatDate);
  // A 1-1 that did not run on the day it was booked, by either route: the coach
  // marked it held after its day (held late, A.31), or the written exchange
  // became the meeting (K.35), which sets heldSource instead. Reading only the
  // first once made the written sentence below unreachable, because a written
  // hold is never marked held late (K.70).
  const ranLate = m.heldLate || m.heldSource === "written";
  if (written.length === 0 && !moved && !ranLate) return null;
  return (
    <div className="admin-coach-block">
      {ranLate && (
        <p className="admin-cell-muted">
          {m.heldSource === "written"
            ? "It did not happen on the day it was booked; it was held in writing instead."
            : "It did not happen on the day it was booked; it was held after it."}
        </p>
      )}
      {moved && <p className="admin-cell-muted">{moved}</p>}
      {written.length > 0 && <span className="admin-eyebrow">What I wrote before this 1-1</span>}
      {written.map(([label, body]) => (
        <p key={label} className="admin-cell-muted">
          <strong>{label}:</strong> {body}
        </p>
      ))}
    </div>
  );
}
