"use client";

import { useState, useTransition } from "react";
import { NEW_TRIP_TYPES, TRIP_TYPE_LABEL, tripLabel, type Trip } from "@/entities/reimbursements/lib/trip-rules";
import { addOwnTrip } from "./actions";

// The trip a claim belongs to (RB.11): pick one of the retreats, trips and
// company events, or add a trip right here when it is not listed yet. A trip
// added here is a draft, internal event, so it never reaches the public events
// pages. The picker only chooses; the page decides what choosing does (the
// New claim form keeps it for the start, the claim page saves it at once).

type NewTrip = { title: string; type: (typeof NEW_TRIP_TYPES)[number]; startsOn: string; endsOn: string };
const BLANK: NewTrip = { title: "", type: "private_trip", startsOn: "", endsOn: "" };

export function TripPicker({
  id,
  trips,
  value,
  onChange,
  disabled,
}: {
  id: string;
  trips: Trip[];
  value: string | null;
  onChange: (tripId: string | null) => void;
  disabled?: boolean;
}) {
  const [known, setKnown] = useState<Trip[]>(trips);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<NewTrip>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof NewTrip>(k: K, v: NewTrip[K]) => setDraft((prev) => ({ ...prev, [k]: v }));

  const add = () =>
    start(async () => {
      setError(null);
      const res = await addOwnTrip(draft);
      if (!res.ok) return setError(res.error);
      setKnown((prev) => [res.trip, ...prev]);
      setAdding(false);
      setDraft(BLANK);
      onChange(res.trip.id);
    });

  return (
    <div className="u-stack u-gap-2">
      <select
        id={id}
        className="admin-select"
        value={value ?? ""}
        disabled={disabled || pending}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">No event</option>
        {known.map((t) => (
          <option key={t.id} value={t.id}>
            {tripLabel(t)}
            {t.type === "private_trip" ? "" : ` (${TRIP_TYPE_LABEL[t.type]})`}
          </option>
        ))}
      </select>
      {!adding ? (
        <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost u-self-start" disabled={disabled} onClick={() => setAdding(true)}>
          + Add an event
        </button>
      ) : (
        <div className="admin-box u-stack u-gap-2">
          <div className="u-grid-2">
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-title`}>Event name</label>
              <input id={`${id}-title`} className="admin-input" value={draft.title} maxLength={200} placeholder="Australia trip" onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-type`}>Kind</label>
              <select id={`${id}-type`} className="admin-select" value={draft.type} onChange={(e) => set("type", e.target.value as NewTrip["type"])}>
                {NEW_TRIP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRIP_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-start`}>From</label>
              <input id={`${id}-start`} type="date" className="admin-input" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor={`${id}-end`}>To</label>
              <input id={`${id}-end`} type="date" className="admin-input" value={draft.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
            </div>
          </div>
          {error && (
            <div className="admin-alert admin-alert--err" role="alert">
              {error}
            </div>
          )}
          <div className="admin-form-actions">
            <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" disabled={pending || !draft.title.trim()} onClick={add}>
              {pending ? "Adding…" : "Add the event"}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--sm"
              disabled={pending}
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
