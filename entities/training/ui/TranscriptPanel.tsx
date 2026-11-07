"use client";

// The session's transcript, for the organiser (English Program PR 6). With one
// in: where it came from and the links, and Replace. Without: the fallback
// card from the wireframe, paste or upload a .txt, .vtt or .srt and add the
// recording link. Either way the save writes the same meeting, transcript and
// association the pickup would, and attendance follows from it.
import { useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import type { Result } from "@/kernel/data/result";
import { formatDate } from "@/kernel/ui/format";
import { ActionNote } from "./ActionNote";

type Transcript = { transcript: string | null; recordingUrl: string | null; minutesUrl: string | null; updatedAt: string | null } | null;

export function TranscriptPanel({ sessionId, transcript, save }: { sessionId: string; transcript: Transcript; save: (id: string, input: unknown) => Promise<Result> }) {
  const [replacing, setReplacing] = useState(false);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState(transcript?.recordingUrl ?? "");
  const { note, pending, run } = useActionRunner();
  const has = Boolean(transcript?.transcript);
  const readFile = async (file: File | null) => {
    if (!file) return;
    setFilename(file.name);
    setText(await file.text());
  };
  const submit = () => run(() => save(sessionId, { text, filename, recordingUrl }), "Transcript saved. Attendance is set from it.", () => setReplacing(false));
  const lines = transcript?.transcript ? transcript.transcript.split("\n").length : 0;

  return (
    <section className={`admin-card admin-section-card tr-card${has ? "" : " tr-fallback"}`} aria-label="Transcript">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">{has ? "Transcript" : "No transcript yet"}</h2>
          <p className="tr-hint">
            {has
              ? `${transcript?.minutesUrl ? "From Lark" : "Uploaded by hand"}${transcript?.updatedAt ? ` · ${formatDate(transcript.updatedAt)}` : ""} · ${lines} lines. Attendance and the recap read it.`
              : "The pickup found nothing after the session. Paste the transcript or upload the file, and add the recording link. Attendance and the recap follow the same way."}
          </p>
        </div>
        {has && (
          <div className="tr-row-actions">
            {transcript?.recordingUrl && (
              <a className="admin-btn admin-btn--sm" href={transcript.recordingUrl} target="_blank" rel="noopener noreferrer">
                Open recording
              </a>
            )}
            {transcript?.minutesUrl && (
              <a className="admin-btn admin-btn--sm" href={transcript.minutesUrl} target="_blank" rel="noopener noreferrer">
                Open in Lark
              </a>
            )}
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => setReplacing((r) => !r)}>
              {replacing ? "Keep it" : "Replace transcript"}
            </button>
          </div>
        )}
      </div>
      {(!has || replacing) && (
        <div className="admin-form tr-phil-form">
          <textarea className="admin-textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the transcript here…" aria-label="Transcript" />
          <div className="admin-form-row">
            <label className="admin-field">
              <span className="admin-label">Or upload .txt, .vtt or .srt</span>
              <input className="admin-input" type="file" accept=".txt,.vtt,.srt,text/plain,text/vtt" onChange={(e) => void readFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="admin-field">
              <span className="admin-label">Recording link · optional</span>
              <input className="admin-input" type="url" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="https://…" />
            </label>
          </div>
          <div className="admin-form-actions">
            <ActionNote note={note} />
            <button type="button" className="admin-btn admin-btn--primary" onClick={submit} disabled={pending || text.trim().length < 20}>
              Save transcript
            </button>
          </div>
        </div>
      )}
      {has && !replacing && <pre className="tr-transcript">{transcript?.transcript}</pre>}
    </section>
  );
}
