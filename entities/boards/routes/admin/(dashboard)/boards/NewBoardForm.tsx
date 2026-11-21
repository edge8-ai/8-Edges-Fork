"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoard } from "./actions";

// Controlled: BoardsIndex owns the open state so the trigger button can live in
// the header row while this form renders full-width below.
export function NewBoardForm({
  clients,
  onClose,
}: {
  clients: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  function submit() {
    if (!name.trim()) return setError("Name the board.");
    setError(null);
    start(async () => {
      const r = await createBoard({ name, clientCompanyId: clientId || undefined });
      if (!r.ok) return setError(r.error);
      if (r.slug) router.push(`/admin/boards/${r.slug}`);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <div className="admin-card admin-section-card u-mb-4">
      <div className="admin-form">
        <div className="admin-field">
          <label className="admin-label">Board name</label>
          <input
            className="admin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Product, or a client name"
            autoFocus
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Client (optional)</label>
          <select className="admin-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client (internal board)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="admin-hint">A client board is read-only in that client&apos;s portal (internal cards hidden).</p>
        </div>
        {error && <div className="admin-alert admin-alert--err">{error}</div>}
        <div className="admin-form-actions u-row">
          <button className="admin-btn admin-btn--primary" onClick={submit} disabled={saving}>
            {saving ? "Creating…" : "Create board"}
          </button>
          <button className="admin-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
