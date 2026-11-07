"use client";

// Importing a profile file (RP.3): a name, the warehouse it describes and the
// file. The file is read here and sent as text, because a profile is a few
// kilobytes of JSON; the action checks it against the schema and names the
// failing field when it refuses. On success the page opens the new profile.
import { useState, type FormEvent } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { importProfile } from "@/entities/replenishment/lib/profile-actions";

const ATOM = "replenishment.profiles";

export function ImportProfile({ may, defaultOpen }: { may: MayProp; defaultOpen: boolean }) {
  const { note, setNote, pending, startTransition, router } = useActionRunner();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [file, setFile] = useState<File | null>(null);

  if (!may[ATOM]) return null;
  if (!open) {
    return (
      <button type="button" className="admin-btn" onClick={() => setOpen(true)}>
        Import a profile
      </button>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!file) {
      setNote({ tone: "err", text: "Choose a profile file." });
      return;
    }
    const chosen = file;
    startTransition(async () => {
      const res = await importProfile({ name, warehouse, json: await chosen.text() });
      if (!res.ok) {
        setNote({ tone: "err", text: res.error });
        return;
      }
      setNote({ tone: "ok", text: "Profile imported." });
      router.push(`/admin/operations/replenishment/profile?profile=${res.id}`);
      router.refresh();
    });
  }

  return (
    <form className="admin-card admin-section-card admin-form" onSubmit={submit}>
      <h2 className="admin-card-title">Import a profile</h2>
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Name</span>
          <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main floor" />
        </label>
        <label className="admin-field">
          <span className="admin-label">Warehouse</span>
          <input className="admin-input" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
        </label>
        <label className="admin-field admin-field--wide">
          <span className="admin-label">Profile file (.json)</span>
          <input className="admin-input" type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {note && <div className={`admin-alert admin-alert--${note.tone}`} role={note.tone === "err" ? "alert" : "status"}>{note.text}</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
        {!defaultOpen && (
          <button type="button" className="admin-btn" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
