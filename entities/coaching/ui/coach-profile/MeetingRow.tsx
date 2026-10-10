"use client";

import { useState } from "react";
import type { Checkin, OneOnOne } from "@/entities/coaching/lib/data/profile";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { setMinutesLink } from "@/entities/coaching/lib/actions";
import { archiveMeeting, generatePrepAction, saveTranscript, summarizeAction } from "@/entities/coaching/lib/meeting-actions";
import { MeetingSummaries } from "./MeetingSummaries";
import { PreMeetingBlock } from "./PreMeetingBlock";
import { MoveMeeting } from "./MoveMeeting";
import { SkipMeeting } from "./SkipMeeting";
import { VoltageNote } from "./VoltageNote";
import { MissedPrompt } from "./MissedPrompt";
import { formatLabel } from "@/entities/coaching/lib/session-done";
import type { LeaveSpan } from "@/entities/coaching/lib/leave-window";
import { moveLine } from "@/entities/coaching/lib/history-shared";
import { type ActionResult, STORED_NOT_SHOWN_NOTE } from "./shared";
import { formatDate } from "@/kernel/ui/format";
import { larkMinutesUrl } from "@/kernel/config/lark";

export function MeetingRow({
  m,
  html,
  run,
  busy,
  isNext = false,
  checkin = null,
  memberLeave,
  todayIso,
}: {
  m: OneOnOne;
  html: { prep: string | null; summary: string | null; shared: string | null } | undefined;
  run: (label: string, fn: () => Promise<ActionResult>, onOk?: () => void) => void;
  busy: boolean;
  isNext?: boolean;
  // The member's pre-meeting form for THIS 1-1, when one exists (K.15). Only
  // ever passed for the upcoming meeting: a form belongs to the cycle it was
  // written in, and the log is for what was said, not what was asked before.
  checkin?: Checkin | null;
  // When this member was away (L.2), so a 1-1 missed over a holiday raises
  // nothing with their coach.
  memberLeave: LeaveSpan[];
  todayIso: string; // Saigon, so the move picker's chips start from the right day
}) {
  // A missed booking opens with the row: the prompt is the thing to answer,
  // and a question nobody sees is not a prompt (K.36).
  const [open, setOpen] = useState(true); // nothing auto-collapses (Khoa, 2026-10-07)
  const [transcript, setTranscript] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");

  const published = Boolean(m.sharedPublishedAt);
  const moved = moveLine(m.movedFrom, m.moveReason, formatDate);

  const prepBlock = (
    <div className={`admin-coach-block${isNext ? " admin-coach-block--prep" : ""}`}>
      <div className="admin-coach-block-head">
        <span className="admin-eyebrow">Prep</span>
        <button className="admin-btn admin-btn--sm" disabled={busy} onClick={() => run("Prep", () => generatePrepAction(m.id))}>
          {m.prepMarkdown ? "Regenerate" : "Generate prep"}
        </button>
      </div>
      {html?.prep ? (
        <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: html.prep }} />
      ) : (
        <div className="admin-cell-muted">No prep yet.</div>
      )}
    </div>
  );

  return (
    <div className={`admin-coach-meeting${isNext ? " admin-coach-meeting--next" : ""}`}>
      <button className="admin-coach-meeting-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <strong>{m.heldOn ? formatDate(m.heldOn) : "-"}</strong>
        {isNext && <span className="admin-badge admin-badge--info admin-coach-meeting-next-tag">Next 1-1</span>}
        <span
          className={`admin-badge ${m.status === "held" ? "admin-badge--ok" : m.status === "skipped" ? "admin-badge--warn" : "admin-badge--info"}`}
        >
          {m.status === "skipped" ? "Skipped" : m.status}
        </span>
        {m.outcome === "passed-unheld" && (
          <span className="admin-badge admin-badge--warn">Did not happen</span>
        )}
        {m.prepMarkdown && <span className="admin-badge admin-badge--ok">Prep ready</span>}
        {formatLabel(m.format) && <span className="admin-badge">{formatLabel(m.format)}</span>}
        {m.modeSplit && (
          <span className="admin-badge admin-badge--info" title="Coach / Mentor / Direct, target 80/15/5">
            {m.modeSplit.coach}/{m.modeSplit.mentor}/{m.modeSplit.direct}
          </span>
        )}
        {m.summaryMarkdown && (
          <span className={`admin-badge ${published ? "admin-badge--ok" : "admin-badge--warn"}`}>
            {published ? "Recap published" : "Recap draft"}
          </span>
        )}
        {m.aiError && <span className="admin-badge admin-badge--err">AI error</span>}
        <span className="admin-coach-meeting-caret">
          {m.prepMarkdown ? (open ? "Hide prep ▾" : "View prep ▸") : open ? "Close ▾" : "Open ▸"}
        </span>
      </button>

      {open && (
        <div className="admin-coach-meeting-body">
          {m.aiError && <div className="admin-alert admin-alert--err">AI: {m.aiError}</div>}

          {/* A booking whose day went by asks before anything else on the row
              (K.36): every other block here assumes the meeting happened. */}
          <MissedPrompt m={m} run={run} busy={busy} memberLeave={memberLeave} />

          {isNext && checkin && <PreMeetingBlock checkin={checkin} prepEdits={m.prepMemberEdits} run={run} busy={busy} />}

          {isNext && <VoltageNote m={m} run={run} busy={busy} />}

          {isNext && prepBlock}

          {/* Mode split — generated from the transcript when the 1-1 is
              analyzed, never entered by hand. Shown only once it exists. */}
          {m.modeSplit && (
            <div className="admin-coach-block">
              <div className="admin-coach-block-head">
                <span className="admin-eyebrow">Mode split, from the transcript (target 80/15/5)</span>
              </div>
              <div className="admin-cell-muted">
                {m.modeSplit.coach}% coach · {m.modeSplit.mentor}% mentor · {m.modeSplit.direct}% direct
              </div>
            </div>
          )}

          {/* Lark Minutes link */}
          <div className="admin-coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Lark Minutes</span>
            </div>
            {m.minutesToken && larkMinutesUrl(m.minutesToken) ? (
              <a
                href={larkMinutesUrl(m.minutesToken) as string}
                target="_blank"
                rel="noreferrer"
                className="admin-cell-muted"
              >
                Recording linked ({m.transcriptSource === "minutes_auto" ? "auto-detected" : "linked"}): open in Lark ↗
              </a>
            ) : m.minutesToken ? (
              // Linked, but with no workspace configured there is no URL to
              // open. Say so rather than falling back to the paste box, which
              // made a saved link look like a save that failed (2026-10-05).
              <div className="admin-cell-muted">
                Recording linked ({m.transcriptSource === "minutes_auto" ? "auto-detected" : "linked"})
              </div>
            ) : (
              <div className="admin-coach-add-row">
                <input
                  className="admin-input"
                  placeholder="Paste the Lark Minutes link…"
                  value={minutesUrl}
                  onChange={(e) => setMinutesUrl(e.target.value)}
                />
                <button
                  className="admin-btn admin-btn--sm"
                  disabled={busy || !minutesUrl.trim()}
                  onClick={() => {
                    run("Minutes link", () => setMinutesLink(m.id, minutesUrl), () => setMinutesUrl(""));
                  }}
                >
                  Link
                </button>
              </div>
            )}
          </div>

          {/* Prep — first in the body on the next 1-1, where it is the thing
              you came for; below the logging blocks on past ones. */}
          {!isNext && prepBlock}

          {/* Transcript */}
          <div className="admin-coach-block">
            <div className="admin-coach-block-head">
              <span className="admin-eyebrow">Transcript</span>
            </div>
            {m.transcript ? (
              <details>
                <summary className="admin-cell-muted">
                  {m.transcript.length.toLocaleString()} characters: view
                </summary>
                <pre className="admin-coach-transcript">{m.transcript}</pre>
              </details>
            ) : (
              <>
                <textarea
                  className="admin-input"
                  rows={5}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Paste the transcript. The AI drafts both summaries and extracts commitments."
                />
                <div className="admin-form-actions">
                  <button
                    className="admin-btn"
                    disabled={busy || !transcript.trim()}
                    onClick={() => run("Transcript", () => saveTranscript(m.id, transcript))}
                  >
                    Save &amp; summarize
                  </button>
                </div>
              </>
            )}
            {m.transcript && !m.summaryMarkdown && (
              <div className="admin-form-actions">
                <button className="admin-btn" disabled={busy} onClick={() => run("Summary", () => summarizeAction(m.id))}>
                  Summarize transcript
                </button>
              </div>
            )}
          </div>

          {/* Where this 1-1 came from, when it was moved (K.33). The member
              sees the same line on their History tab. */}
          {moved && <div className="admin-cell-muted">{moved}</div>}

          <MoveMeeting m={m} run={run} busy={busy} todayIso={todayIso} />

          <SkipMeeting m={m} run={run} busy={busy} />

          <MeetingSummaries m={m} html={html} run={run} busy={busy} />

          {/* Stored, not shown (K.5): the private tiers stay in their tables
              and stay off the member's view. One line under the recap says so
              rather than the page quietly implying they do not exist. */}
          <div className="admin-hint">{STORED_NOT_SHOWN_NOTE}</div>

          <div className="admin-coach-block admin-coach-block--danger">
            <ConfirmButton
              label="Archive this 1-1"
              className="admin-btn admin-btn--sm admin-btn--danger"
              title="Archive this 1-1?"
              body="It disappears from both views."
              confirmLabel="Archive"
              disabled={busy}
              onConfirm={() => archiveMeeting(m.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
