"use client";

// The transcript for one interview round: upload a file, paste text, or read
// back what was stored. Split out of InterviewRounds.tsx, which had grown to
// hold the whole interview journey in one module.

import { useRef, useState } from "react";
import {
  getTranscript,
  saveTranscriptText,
  uploadInterviewTranscript,
  type InterviewRound,
} from "./interview-actions";

export function TranscriptPanel({ round, onChange }: { round: InterviewRound; onChange: () => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function view() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (text === null) {
      const r = await getTranscript(round.id);
      if (r.ok) setText(r.text);
      else setErr(r.error);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("transcript", file);
    const r = await uploadInterviewTranscript(round.id, fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!r.ok) return setErr(r.error);
    setText(null);
    await onChange();
  }

  async function savePaste() {
    setBusy(true);
    setErr(null);
    const r = await saveTranscriptText(round.id, paste);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPaste("");
    setShowPaste(false);
    setText(null);
    await onChange();
  }

  return (
    <div className="admin-panel-soft">
      <div className="u-row u-wrap">
        <span className="admin-label u-m-0">
          Transcript
        </span>
        {round.transcriptDocId ? (
          <>
            <span className="admin-cell-muted">on file</span>
            <button type="button" className="admin-btn admin-btn--sm" onClick={view}>
              {open ? "Hide" : "View"}
            </button>
          </>
        ) : (
          <span className="admin-cell-muted">none yet</span>
        )}
        <span className="u-row u-ml-auto">
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => setShowPaste((v) => !v)}
          >
            {round.transcriptDocId ? "Replace by paste" : "Paste"}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Saving…" : "Upload"}
          </button>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.vtt,.srt,text/plain"
          className="u-hidden-input"
          onChange={onFile}
        />
      </div>

      {showPaste && (
        <div className="u-mt-2">
          <textarea
            className="admin-input"
            rows={5}
            placeholder="Paste the interview transcript…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="u-row u-mt-2">
            <button
              type="button"
              className="admin-btn admin-btn--primary admin-btn--sm"
              disabled={busy || !paste.trim()}
              onClick={savePaste}
            >
              {busy ? "Saving…" : "Save transcript"}
            </button>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setShowPaste(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="admin-alert admin-alert--err u-mt-2">
          {err}
        </div>
      )}

      {open && (
        <div
          className="u-mt-2 u-pl-3 admin-quote u-prewrap admin-scroll-sm"
        >
          {text === null ? <span className="admin-hint">Loading transcript…</span> : text || "—"}
        </div>
      )}
    </div>
  );
}
