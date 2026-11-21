"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";

// The three ways a job ends, each in words with a line on when it applies. They
// used to hide in a select beside a Cancel button, so "Cancelled" (an outcome)
// sat next to "Cancel" (keep the job open) and HR could not tell them apart.
const CLOSE_OUTCOMES = [
  { value: "filled", label: "Filled", help: "We hired someone for it." },
  { value: "closed", label: "Closed without a hire", help: "We stopped looking and nobody was hired." },
  { value: "cancelled", label: "Cancelled", help: "The job is not needed any more." },
] as const;

export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number]["value"];

// The confirm button says what it will do, so it follows the choice.
const CONFIRM_LABEL: Record<CloseOutcome, string> = {
  filled: "Close as filled",
  closed: "Close with no hire",
  cancelled: "Close as cancelled",
};

const CLOSED_LINE: Record<CloseOutcome, string> = {
  filled: "Closed as filled.",
  closed: "Closed with no hire.",
  cancelled: "Cancelled.",
};

/** The sentence that confirms a job was closed with this outcome. */
export function closedLine(outcome: CloseOutcome): string {
  return CLOSED_LINE[outcome];
}

// How a job is closed, wherever it is closed from. The open-job card and the
// job's drawer both draw this one control, so the two cannot drift apart: they
// did once, when the 11 Nov card redesign left closing only at the foot of the
// drawer and HR could not find it. Closing asks how the job ended; the server
// stamps closed_at and ends the job's hiring chain. The caller hands in the
// close action, so the caller decides who is shown the control (ADR 0014).
export function CloseReqPanel({
  close: closeReq,
  initialOutcome = "",
  compact = false,
  onCancel,
  onClosed,
}: {
  /** closeJobReq for this job. */
  close: (outcome: CloseOutcome) => Promise<Result>;
  /** Preselected when the caller already knows, as when every seat is hired. */
  initialOutcome?: CloseOutcome | "";
  /** Small buttons, for the card's action row. */
  compact?: boolean;
  onCancel: () => void;
  onClosed: (outcome: CloseOutcome) => void;
}) {
  const router = useRouter();
  // Two panels can be open on one page (a card's and the drawer's), so each
  // radio group needs a name of its own.
  const group = useId();
  const [outcome, setOutcome] = useState<CloseOutcome | "">(initialOutcome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btn = compact ? "admin-btn admin-btn--sm" : "admin-btn";

  async function close() {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    const r = await closeReq(outcome);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onClosed(outcome);
    router.refresh();
  }

  return (
    <div className="u-stack ats-close-req">
      <fieldset className="ats-outcomes" disabled={busy}>
        <legend>How did this job end?</legend>
        {CLOSE_OUTCOMES.map((o, i) => (
          <label key={o.value} className="ats-outcome">
            <input
              type="radio"
              name={group}
              value={o.value}
              checked={outcome === o.value}
              onChange={() => setOutcome(o.value)}
              // The panel opens on purpose, so the choice it asks for takes the
              // focus: the preselected answer, else the first.
              autoFocus={outcome ? outcome === o.value : i === 0}
            />
            <span>
              <b>{o.label}</b>
              <span>{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="u-row u-wrap">
        <button type="button" className={`${btn} admin-btn--primary`} disabled={!outcome || busy} onClick={close}>
          {busy ? "Closing…" : outcome ? CONFIRM_LABEL[outcome] : "Close job"}
        </button>
        <button type="button" className={btn} onClick={onCancel} disabled={busy}>
          Keep open
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-hint">Closing takes the ad off the careers page. Candidates and their history stay.</div>
    </div>
  );
}
