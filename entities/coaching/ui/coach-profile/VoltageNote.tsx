"use client";

import { useState } from "react";
import type { OneOnOne } from "@/entities/coaching/lib/data/profile";
import { saveVoltageNote } from "@/entities/coaching/lib/schedule-actions";
import { type ActionResult } from "./shared";

// "Where is my energy today" (K.23, Hogan's manager voltage): one private line
// the coach writes before walking in. Nobody else reads it, the member's page
// never selects it, and it is cleared when the meeting is marked held.
export function VoltageNote({
  m,
  run,
  busy,
}: {
  m: OneOnOne;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
}) {
  const [text, setText] = useState(m.coachVoltage ?? "");
  if (m.status === "held") return null;
  return (
    <div className="admin-coach-block">
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Where is my energy today</span>
      </div>
      <div className="admin-hint">Only you see this. It is cleared when the 1-1 is marked held.</div>
      <div className="admin-coach-add-row">
        <input
          className="admin-input"
          maxLength={200}
          placeholder="One line, for you."
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Where is my energy today"
        />
        <button
          className="admin-btn admin-btn--sm"
          disabled={busy || text === (m.coachVoltage ?? "")}
          onClick={() => run("Voltage", () => saveVoltageNote(m.id, text))}
        >
          Save
        </button>
      </div>
    </div>
  );
}
