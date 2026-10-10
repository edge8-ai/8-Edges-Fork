"use client";

import { useEffect, useState } from "react";
import { formatDate, humanize } from "@/kernel/ui/format";
import { addDealCommunication, getDealCommunications, type Communication } from "./actions";

// A deal's communication log. Free-text entries append to the shared activity
// log (interactions), newest first. Automatic stage-change rows are filtered out
// server-side so this reads as a human conversation history.
export function DealCommunications({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadErr(null);
    getDealCommunications(dealId).then((r) => {
      if (!live) return;
      if (r.ok) setItems(r.items);
      else setLoadErr(r.error);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [dealId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setSaveErr(null);
    const r = await addDealCommunication(dealId, text);
    setSaving(false);
    if (!r.ok) return setSaveErr(r.error);
    setItems((cur) => [r.item, ...cur]);
    setBody("");
  }

  return (
    <div>
      <div className="admin-section-label u-mb-3">
        Communications{items.length > 0 ? ` (${items.length})` : ""}
      </div>

      <div className="admin-field">
        <textarea
          className="admin-input"
          rows={3}
          placeholder="Log a call, email, or note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="admin-form-actions u-mb-3">
        <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={add} disabled={saving || !body.trim()}>
          {saving ? "Adding…" : "Add communication"}
        </button>
      </div>
      {saveErr && (
        <div className="admin-alert admin-alert--err u-mb-3">
          {saveErr}
        </div>
      )}

      {loading ? (
        <div className="admin-hint">Loading…</div>
      ) : loadErr ? (
        <div className="admin-alert admin-alert--err">{loadErr}</div>
      ) : items.length === 0 ? (
        <div className="admin-empty">No communications yet.</div>
      ) : (
        <ul className="admin-deal-comm-list">
          {/* Each entry starts folded to one line so a long thread stays
              scannable; opening it shows the full text. */}
          {items.map((c) => {
            const full = c.body || c.subject || "—";
            return (
              <li key={c.id}>
                <details className="admin-deal-comm">
                  <summary className="admin-deal-comm-summary">
                    <span className="admin-deal-comm-meta">
                      {humanize(c.kind)} · {formatDate(c.occurredAt)}
                    </span>
                    <span className="admin-deal-comm-preview">{c.subject || full.replace(/\s+/g, " ")}</span>
                  </summary>
                  <div className="admin-deal-comm-body u-prewrap">{full}</div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
