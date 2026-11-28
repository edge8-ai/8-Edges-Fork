"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MayProp } from "@/kernel/identity/may-prop";
import { proposeWorkRequest } from "./actions";

// A contractor's own request: what they will do, how long it will take and
// which of their boards the card goes on. It waits for an admin to approve the
// estimate, like a request an admin sent.
export function ProposeWorkForm({ boards, may }: { boards: { id: string; name: string }[]; may: MayProp }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [hours, setHours] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!may["work-requests.contractor-work"]) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const r = await proposeWorkRequest({ title, brief, estimatedHours: Number(hours), boardId });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTitle("");
    setBrief("");
    setHours("");
    setSent(true);
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <label className="admin-field">
        <span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="admin-field">
        <span>What needs doing, your plan, and what &quot;done&quot; looks like</span>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={6} required />
      </label>
      <label className="admin-field">
        <span>Estimated hours</span>
        <input type="number" min="0.25" step="0.25" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} required />
      </label>
      {boards.length > 1 && (
        <label className="admin-field">
          <span>Board</span>
          <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {sent && !error && <div className="admin-alert admin-alert--ok">Sent. It shows below and on your board while an admin reviews the estimate.</div>}
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving || boards.length === 0}>
          {saving ? "Sending…" : "Send for approval"}
        </button>
      </div>
    </form>
  );
}
