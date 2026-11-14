"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { humanize } from "@/kernel/ui/format";
import { EVENT_TYPES, EVENT_VISIBILITIES, type EventType, type EventVisibility } from "@/entities/retreats/client";
import { createEvent } from "./actions";

// "New event" modal on the Events hub. Creates a draft — the manage shelf is
// where tiers get added and status flips to Open when it's ready to sell.
export function NewEventButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<EventType>("workshop");
  const [visibility, setVisibility] = useState<EventVisibility>("public");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("");
  const [blurb, setBlurb] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const cap = capacity.trim() === "" ? null : Number(capacity);
    const r = await createEvent({
      title,
      type,
      visibility,
      location: location || null,
      starts_at: startsAt || null,
      ends_at: endsAt || null,
      capacity: cap,
      blurb: blurb || null,
    });
    setPending(false);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setTitle("");
    setLocation("");
    setStartsAt("");
    setEndsAt("");
    setCapacity("");
    setBlurb("");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="admin-btn admin-btn--primary" onClick={() => setOpen(true)}>
        New event
      </button>

      {open && (
        <div className="admin-modal-backdrop" onClick={close}>
          <div
            className="admin-modal u-max-6"
            role="dialog"
            aria-modal="true"
            aria-label="New event"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-title">New event</div>
            <form
              className="admin-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {error && <div className="admin-alert admin-alert--err">{error}</div>}

              <div className="admin-field">
                <label className="admin-label">Title</label>
                <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
              </div>
              <div className="u-grid-2 u-gap-3">
                <div className="admin-field">
                  <label className="admin-label">Type</label>
                  <select className="admin-select" value={type} onChange={(e) => setType(e.target.value as EventType)}>
                    {EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {humanize(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field">
                  <label className="admin-label">Visibility</label>
                  <select
                    className="admin-select"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as EventVisibility)}
                  >
                    {EVENT_VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {humanize(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="u-grid-2 u-gap-3">
                <div className="admin-field">
                  <label className="admin-label">Start date</label>
                  <input className="admin-input" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className="admin-field">
                  <label className="admin-label">End date</label>
                  <input className="admin-input" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </div>
              <div className="u-grid-2 u-gap-3">
                <div className="admin-field">
                  <label className="admin-label">Location</label>
                  <input className="admin-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
                </div>
                <div className="admin-field">
                  <label className="admin-label">Capacity</label>
                  <input
                    className="admin-input"
                    type="number"
                    min={0}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Uncapped"
                  />
                </div>
              </div>
              <div className="admin-field">
                <label className="admin-label">One-line blurb (optional)</label>
                <input className="admin-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
              </div>
              <div className="admin-hint">
                Created as a draft — add tickets from the event&apos;s shelf, then set status to Open to start taking
                registrations.
              </div>
              <div className="admin-modal-actions">
                <button type="button" className="admin-btn" onClick={close} disabled={pending}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
                  {pending ? "Creating…" : "Create draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
