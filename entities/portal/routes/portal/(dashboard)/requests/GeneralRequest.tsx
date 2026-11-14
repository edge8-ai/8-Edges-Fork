"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitGeneralInquiry } from "./actions";

// Inline general-request form (Redeem.tsx pattern): subject + message straight
// into the CRM inquiries pipeline.
export function GeneralRequest() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await submitGeneralInquiry({ subject, message });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setSent(true);
      setOpen(false);
      setSubject("");
      setMessage("");
      router.refresh();
    });
  }

  if (sent && !open) {
    return (
      <div className="u-stack">
        <div className="admin-alert admin-alert--ok">Sent — the Edge8 team will get back to you.</div>
        <button type="button" className="admin-btn" onClick={() => setSent(false)}>
          Send another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        New general request
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="u-stack u-gap-3">
      <label className="admin-field">
        <span>Subject</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Help automating our invoicing"
          required
        />
      </label>
      <label className="admin-field">
        <span>What do you need?</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required />
      </label>
      {err && <div className="admin-alert admin-alert--err">{err}</div>}
      <div className="u-row">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </button>
        <button type="button" className="admin-btn" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
