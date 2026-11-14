"use client";

// The learner's homework submitter (English Program PR 4): write, upload, a
// link, or a recording made in the browser. A file or recording goes straight
// from the browser to the private bucket through a signed URL, and only its
// path reaches the action, so a function body never carries the bytes.
import { useRef, useState } from "react";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { putToSignedUrl } from "@/kernel/ui/upload";
import type { Result } from "@/kernel/data/result";
import { KIND_LABEL, type SubmissionKind } from "@/entities/training/lib/assignment-rules";
import { ActionNote } from "./ActionNote";

export type HomeworkActions = {
  startUpload: (assignmentId: string, filename: string) => Promise<{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }>;
  submit: (assignmentId: string, input: unknown) => Promise<Result>;
};

export function SubmitHomework({ assignmentId, accepts, actions, onDone }: { assignmentId: string; accepts: SubmissionKind[]; actions: HomeworkActions; onDone?: () => void }) {
  const [kind, setKind] = useState<SubmissionKind>(accepts[0] ?? "written");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState<Blob | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording">("idle");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { note, pending, run } = useActionRunner();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        setRecording(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setRecState("recording");
    } catch {
      window.alert("The microphone could not be opened.");
    }
  };
  const stopRecording = () => {
    recorder.current?.stop();
    setRecState("idle");
  };

  const upload = async (blob: Blob, name: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
    const start = await actions.startUpload(assignmentId, name);
    if (!start.ok) return start;
    setProgress(0);
    const put = await putToSignedUrl(start.signedUrl, new File([blob], name, { type: blob.type }), setProgress);
    setProgress(null);
    if (!put.ok) return { ok: false, error: put.error ?? "Upload failed." };
    return { ok: true, path: start.path };
  };

  const submit = () =>
    run(
      async () => {
        if (kind === "written") return actions.submit(assignmentId, { kind, text });
        if (kind === "link") return actions.submit(assignmentId, { kind, url });
        const blob = kind === "upload" ? file : recording;
        if (!blob) return { ok: false, error: kind === "upload" ? "Pick a file." : "Record something first." };
        const name = kind === "upload" && file ? file.name : `recording-${Date.now()}.webm`;
        const up = await upload(blob, name);
        if (!up.ok) return up;
        return actions.submit(assignmentId, { kind, storagePath: up.path });
      },
      "Submitted.",
      onDone,
    );

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="tr-submit">
      <div className="tr-chips" role="group" aria-label="How to submit">
        {accepts.map((k) => (
          <button key={k} type="button" className={`tr-chip${kind === k ? " is-on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {kind === "written" && <textarea className="admin-textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer" aria-label="Written answer" />}
      {kind === "link" && <input className="admin-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Link" />}
      {kind === "upload" && <input className="admin-input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="File" />}
      {kind === "recording" && (
        <div className="tr-recorder">
          {recState === "idle" ? (
            <button type="button" className="admin-btn" onClick={startRecording}>
              ● Record
            </button>
          ) : (
            <button type="button" className="admin-btn tr-btn-ink" onClick={stopRecording}>
              ■ Stop
            </button>
          )}
          <span className="tr-row-meta">
            {mm}:{ss}
            {recording && recState === "idle" ? " · recorded, ready to submit" : ""}
          </span>
          {recording && recState === "idle" && <audio controls src={URL.createObjectURL(recording)} className="tr-audio" />}
        </div>
      )}
      {progress !== null && <p className="tr-hint">Uploading… {Math.round(progress * 100)}%</p>}
      <div className="tr-cool-actions">
        <ActionNote note={note} />
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={submit} disabled={pending || progress !== null}>
          Submit
        </button>
      </div>
    </div>
  );
}
