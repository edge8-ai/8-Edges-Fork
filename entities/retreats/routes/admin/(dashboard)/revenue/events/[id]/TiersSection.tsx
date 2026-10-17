"use client";

import { useState } from "react";
import { Badge } from "@/kernel/ui/Badge";
import { tierPriceLabel } from "@/entities/retreats/client";
import { addEventTier, setTierActive } from "../actions";
import type { SettingsTier } from "./EventSettings";

// Tier list + add form. A tier's price is immutable once it can be bought —
// deactivate and add a new tier to reprice — so the only per-tier action is
// the active toggle.
export function TiersSection({
  eventId,
  tiers,
  onChanged,
  setMsg,
}: {
  eventId: string;
  tiers: SettingsTier[];
  onChanged: () => void;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const r = await addEventTier(eventId, {
      title,
      amountUsd: Number(price) || 0,
      capacity: capacity.trim() === "" ? null : Number(capacity),
      description: description || null,
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setTitle("");
    setPrice("0");
    setCapacity("");
    setDescription("");
    setShowAdd(false);
    onChanged();
  }

  async function toggle(tierId: string, active: boolean) {
    setTogglingId(tierId);
    const r = await setTierActive(eventId, tierId, active);
    setTogglingId(null);
    if (!r.ok) setMsg({ ok: false, text: r.error });
    else onChanged();
  }

  return (
    <div className="u-mt-4">
      <div className="admin-card-head">
        <div className="admin-cell-muted u-label">
          Tickets
        </div>
        <button type="button" className="admin-btn" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "Add ticket"}
        </button>
      </div>

      {showAdd && (
        <form
          className="admin-form u-mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {error && <div className="admin-alert admin-alert--err">{error}</div>}
          <div className="admin-field">
            <label className="admin-label">Ticket name</label>
            <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="General admission" />
          </div>
          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label">Price (USD)</label>
              <input className="admin-input" type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              <div className="admin-hint">0 = free ticket</div>
            </div>
            <div className="admin-field">
              <label className="admin-label">Seats for this ticket</label>
              <input className="admin-input" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Uncapped" />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">What&apos;s included (optional)</label>
            <input className="admin-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
              {pending ? "Adding…" : "Add ticket"}
            </button>
          </div>
        </form>
      )}

      {tiers.length === 0 ? (
        <div className="admin-empty">No tickets. The event registers as free.</div>
      ) : (
        <div className="admin-list">
          {tiers.map((t) => (
            <div className="admin-list-row" key={t.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{t.title}</div>
                <div className="admin-list-sub">
                  {[t.description, t.capacity ? `${t.capacity} seats` : null].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="admin-list-aside u-row">
                <span className="admin-cell-mono">{tierPriceLabel({ amount_cents: t.amountCents, currency: t.currency })}</span>
                {!t.active && <Badge tone="neutral">Inactive</Badge>}
                <button type="button" className="admin-btn" disabled={togglingId === t.id} onClick={() => toggle(t.id, !t.active)}>
                  {t.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="admin-hint u-mt-2">
        Prices are fixed once a ticket is on sale. Deactivate it and add a new one to reprice.
      </div>
    </div>
  );
}
