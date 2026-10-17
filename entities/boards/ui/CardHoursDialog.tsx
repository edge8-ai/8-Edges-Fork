"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { HoursReport } from "@/entities/boards/lib/types";

// The question a contractor answers as their work request's card reaches
// Done: how many hours it took. It asks for what the /work/[token] submission
// asks for, because the answer is that submission; the Deals board's Won and
// Lost prompts are the same idea (a move that needs one more fact first).
// Built on ConfirmDialog's modal classes and portalled to the body for the
// same reason ConfirmDialog is: a transformed board lane would trap it.
export function CardHoursDialog({
  title,
  onSubmit,
  onClose,
}: {
  title: string;
  /** Records the hours and lands the card; the dialog closes only on ok. */
  onSubmit: (report: HoursReport) => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
}) {
  const [hours, setHours] = useState("");
  const [overtime, setOvertime] = useState("");
  const [summary, setSummary] = useState("");
  const [link, setLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onClose]);

  useEffect(() => hoursRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const r = await onSubmit({ actualHours: Number(hours), overtimeHours: Number(overtime || 0), summary, link });
    setPending(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="admin-modal-backdrop" onClick={() => !pending && onClose()}>
      <form
        className="admin-modal admin-form"
        role="dialog"
        aria-modal="true"
        aria-label="Report your hours"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="admin-modal-title">Report your hours</div>
        <div className="admin-modal-body">
          <p className="admin-hint">&ldquo;{title}&rdquo; is done. How long did it take?</p>
          <div className="admin-field">
            <label className="admin-label" htmlFor="card-hours-actual">Total hours worked</label>
            <input
              id="card-hours-actual"
              ref={hoursRef}
              className="admin-input"
              type="number"
              min="0.25"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="card-hours-overtime">Overtime hours (if any)</label>
            <input
              id="card-hours-overtime"
              className="admin-input"
              type="number"
              min="0"
              step="0.25"
              value={overtime}
              onChange={(e) => setOvertime(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="card-hours-summary">What you did</label>
            <textarea
              id="card-hours-summary"
              className="admin-textarea"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="A short explanation of the work done."
              required
            />
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="card-hours-link">Supporting link (Figma, Drive, staging URL…)</label>
            <input
              id="card-hours-link"
              className="admin-input"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>

        {error && <div className="admin-alert admin-alert--err u-mt-3">{error}</div>}

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
            {pending ? "Saving…" : "Submit hours"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
