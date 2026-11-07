"use client";

// Uploading this week's export (RP.4): pick the profile to read it with and
// the file. The action reads it, runs the engine once and writes a draft; on
// success the run's page opens, so the manager checks it before sending. A
// refusal (a missing column, a damaged workbook) is the reader's own sentence.
import { useState, type FormEvent } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { useActionRunner } from "@/kernel/ui/useActionRunner";
import { createRun } from "@/entities/replenishment/lib/run-actions";

const ATOM = "replenishment.runs";

export function UploadExport({ may, profiles }: { may: MayProp; profiles: { id: string; name: string; warehouse: string }[] }) {
  const { note, setNote, pending, startTransition, router } = useActionRunner();
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);

  if (!may[ATOM]) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setNote(null);
    if (!file) {
      setNote({ tone: "err", text: "Choose this week's stock export." });
      return;
    }
    const data = new FormData();
    data.set("profileId", profileId);
    data.set("file", file);
    startTransition(async () => {
      const res = await createRun(data);
      if (!res.ok) {
        setNote({ tone: "err", text: res.error });
        return;
      }
      router.push(`/admin/operations/replenishment/runs/${res.id}`);
    });
  }

  return (
    <form className="admin-card admin-section-card admin-form" onSubmit={submit}>
      <h2 className="admin-card-title">Upload an export</h2>
      <div className="admin-form-row">
        {profiles.length > 1 && (
          <label className="admin-field">
            <span className="admin-label">Profile</span>
            <select className="admin-select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.warehouse})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="admin-field admin-field--wide">
          <span className="admin-label">Stock export (.xlsx or .csv)</span>
          <input
            className="admin-input"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
          {pending ? "Reading…" : "Upload and check"}
        </button>
      </div>
      {profiles.length === 1 && <p className="admin-hint u-m-0">Read with the {profiles[0].name} profile.</p>}
      {note && (
        <div className={`admin-alert admin-alert--${note.tone}`} role={note.tone === "err" ? "alert" : "status"}>
          {note.text}
        </div>
      )}
    </form>
  );
}
