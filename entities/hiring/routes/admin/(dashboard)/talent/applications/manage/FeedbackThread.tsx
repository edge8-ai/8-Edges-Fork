"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/kernel/ui/format";
import { addApplicationNote, getApplicationNotes, type AppNote } from "../actions";

// An append-only, attributed feedback thread for this application, stored in the
// shared interactions log. Distinct from the structured interview scorecards.
export function FeedbackThread({ applicationId }: { applicationId: string }) {
  const [items, setItems] = useState<AppNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadErr(null);
    getApplicationNotes(applicationId).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items);
      else setLoadErr(r.error);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [applicationId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setSaveErr(null);
    const r = await addApplicationNote(applicationId, text);
    setSaving(false);
    if (!r.ok) return setSaveErr(r.error);
    setItems((cur) => [r.item, ...cur]);
    setBody("");
  }

  return (
    <section className="admin-card admin-section-card">
      <div className="admin-section-label u-mb-2">Feedback</div>
      <div className="u-row u-mb-3">
        <textarea
          className="admin-input u-grow"
          rows={2}
          placeholder="Add feedback for this candidate…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          type="button"
          className="admin-btn admin-btn--primary admin-btn--sm u-self-start"
          onClick={add}
          disabled={saving || !body.trim()}
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
      {saveErr && <div className="admin-alert admin-alert--err u-mb-3">{saveErr}</div>}

      {loading ? (
        <div className="admin-hint">Loading…</div>
      ) : loadErr ? (
        <div className="admin-alert admin-alert--err">{loadErr}</div>
      ) : items.length === 0 ? (
        <div className="admin-empty">No feedback yet.</div>
      ) : (
        <ul className="u-stack u-gap-3 u-m-0 u-p-0 u-list-plain">
          {items.map((n) => (
            <li key={n.id} className="u-pl-3 admin-quote">
              <div className="admin-cell-muted u-mb-1 u-sm">
                {n.author ? `${n.author} · ` : ""}
                {formatDate(n.occurredAt)}
              </div>
              <div className="u-ink-2 u-prewrap">{n.body || "—"}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
