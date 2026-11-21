"use client";

import { useState } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { skipOneOnOne } from "@/entities/coaching/lib/meeting-actions";
import { type ActionResult } from "./shared";

// Skip a 1-1 with a reason (K.9). A skipped week is a fact about the rhythm,
// so the row stays in the log carrying why, and the profile's next date rolls
// forward by the cadence behind it. The reason is a one-line inline form, not
// a window.prompt: the coach is writing something another human reads.
export function SkipMeeting({
  m,
  run,
  busy,
}: {
  m: OneOnOne;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (m.status === "skipped") {
    return (
      <div className="admin-coach-block">
        <div className="admin-coach-block-head">
          <span className="admin-eyebrow">Skipped</span>
        </div>
        <div className="admin-cell-muted">{m.skipReason || "No reason recorded."}</div>
      </div>
    );
  }
  // A 1-1 that happened cannot be skipped after the fact.
  if (m.status === "held") return null;

  return (
    <div className="admin-coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Skip this 1-1</span>
      </div>
      {open ? (
        <div className="admin-coach-add-row">
          <input
            className="admin-input"
            placeholder="Why was it skipped?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="admin-btn admin-btn--sm"
            disabled={busy || !reason.trim()}
            onClick={() => {
              run("Skip", () => skipOneOnOne(m.id, reason), () => {
                setReason("");
                setOpen(false);
              });
            }}
          >
            Skip
          </button>
          <button className="admin-btn admin-btn--sm" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => setOpen(true)}>
          Skip with a reason
        </button>
      )}
    </div>
  );
}
