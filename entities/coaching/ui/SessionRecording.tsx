"use client";

import { useId } from "react";

// Step 4 of marking a session done (K.80 follow-up): the recording, optional
// and genuinely useful. A Lark Minutes link joins the session to its recording;
// a pasted transcript is summarized into a recap draft and the commitments it
// mentions. Neither is required, and the coach's own note, if written, is kept
// over the AI's draft.
export function SessionRecording({
  minutesUrl,
  setMinutesUrl,
  transcript,
  setTranscript,
}: {
  minutesUrl: string;
  setMinutesUrl: (v: string) => void;
  transcript: string;
  setTranscript: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="coach-done-step">
      <span className="coach-picker-label">
        4 · The recording <span className="coach-optional">optional · the AI drafts a recap from it</span>
      </span>
      <div className="coach-done-cols">
        <div className="coach-done-step">
          <label className="coach-picker-label" htmlFor={`${id}-minutes`}>
            Lark Minutes link
          </label>
          <input
            id={`${id}-minutes`}
            className="admin-input"
            inputMode="url"
            placeholder="https://…/minutes/…"
            value={minutesUrl}
            onChange={(e) => setMinutesUrl(e.target.value)}
          />
        </div>
        <div className="coach-done-step">
          <label className="coach-picker-label" htmlFor={`${id}-transcript`}>
            Or paste the transcript
          </label>
          <textarea
            id={`${id}-transcript`}
            className="admin-input coach-done-note"
            rows={3}
            placeholder="Paste the transcript or your raw notes."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
