"use client";

// What an action said, and the footer of a training drawer (TR.2): written once
// for the Cool-down tray, Log a training and the organiser's drawer, so the
// three cannot drift in wording, role or layout. An error is an alert; a
// success is a status, which a screen reader announces without interrupting.
import type { ActionNote as Note } from "@/kernel/ui/useActionRunner";

export function ActionNote({ note, only }: { note: Note; only?: "ok" | "err" }) {
  if (!note || (only && note.tone !== only)) return null;
  return (
    <p className={`tr-note is-${note.tone}`} role={note.tone === "err" ? "alert" : "status"}>
      {note.text}
    </p>
  );
}

export function DrawerFooter({ note, pending, onCancel, onSubmit, submitLabel }: { note: Note; pending: boolean; onCancel: () => void; onSubmit: () => void; submitLabel: string }) {
  return (
    <div className="admin-form-actions">
      <ActionNote note={note} only="err" />
      <button type="button" className="admin-btn" onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <button type="button" className="admin-btn admin-btn--primary" onClick={onSubmit} disabled={pending}>
        {submitLabel}
      </button>
    </div>
  );
}
