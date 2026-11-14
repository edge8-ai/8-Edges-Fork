"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadApplicationResume } from "../actions";

export function ResumeField({ applicationId, resumeDocumentId }: { applicationId: string; resumeDocumentId: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState(resumeDocumentId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("resume", file);
    const r = await uploadApplicationResume(applicationId, fd);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!r.ok) return setErr(r.error);
    setDocId(r.documentId);
    router.refresh();
  }

  return (
    <span className="u-row u-wrap">
      {docId ? (
        <a href={`/admin/talent/resume/${docId}`} target="_blank" rel="noreferrer" className="admin-cell-strong">
          Open ↗
        </a>
      ) : (
        <span className="admin-cell-muted">none</span>
      )}
      <button type="button" className="admin-btn admin-btn--sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : docId ? "Replace" : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="u-hidden"
        onChange={onFile}
      />
      {err && <span className="u-err">{err}</span>}
    </span>
  );
}
