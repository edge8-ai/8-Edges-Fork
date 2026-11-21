"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { updateCompany } from "@/entities/crm/lib/companies-actions";
import { timeZoneOptions } from "@/entities/crm/lib/company-time-zone";

type Field = "client_start_date" | "client_end_date" | "time_zone" | "working_day_start";

// The client relationship's start and end dates. Read-only until Edit, like the
// Details card. Each field is a date picker; the value is the stored
// "YYYY-MM-DD", and an empty field clears the date. The client's time zone and
// working-day start sit here too (CR.5.1): client-review emails go out in that
// working day.
export function ClientTermCard({
  companyId,
  startDate,
  endDate,
  timeZone,
  workingDayStart,
}: {
  companyId: string;
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  workingDayStart: string | null;
}) {
  // The column is a time, so it arrives as "09:00:00"; the input wants "09:00".
  const startHm = workingDayStart ? workingDayStart.slice(0, 5) : null;
  const zones = timeZoneOptions();
  // A saved zone the runtime does not list (an alias) must still show as chosen.
  if (timeZone && !zones.includes(timeZone)) zones.push(timeZone);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(field: Field, input: HTMLInputElement | HTMLSelectElement, current: string | null) {
    const value = input.value;
    if (value === (current ?? "")) return;
    setError(null);
    const r = await updateCompany(companyId, { [field]: value });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  function dateField(field: Field, label: string, current: string | null) {
    return (
      <div className="admin-field">
        <label className="admin-label" htmlFor={field}>{label}</label>
        <input
          id={field}
          type="date"
          className="admin-input"
          defaultValue={current ?? ""}
          onBlur={(e) => save(field, e.currentTarget, current)}
        />
      </div>
    );
  }

  function clientDayFieldsView() {
    return (
      <>
        <div className="admin-field">
          <label className="admin-label" htmlFor="time_zone">Time zone</label>
          <select
            id="time_zone"
            className="admin-input"
            defaultValue={timeZone ?? ""}
            onChange={(e) => save("time_zone", e.currentTarget, timeZone)}
          >
            <option value="">Not set</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label" htmlFor="working_day_start">Working day starts</label>
          <input
            id="working_day_start"
            type="time"
            className="admin-input"
            defaultValue={startHm ?? ""}
            onBlur={(e) => save("working_day_start", e.currentTarget, startHm)}
          />
        </div>
      </>
    );
  }

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Client relationship</h2>
        <button type="button" className="admin-btn" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Edit"}
        </button>
      </div>
      {editing ? (
        <div className="u-grid-2 u-gap-3">
          {dateField("client_start_date", "Start date", startDate)}
          {dateField("client_end_date", "End date", endDate)}
          {clientDayFieldsView()}
        </div>
      ) : (
        <dl className="admin-kv">
          <dt>Start date</dt>
          <dd>{formatDate(startDate)}</dd>
          <dt>End date</dt>
          <dd>{endDate ? formatDate(endDate) : "Open-ended"}</dd>
          <dt>Time zone</dt>
          <dd>{timeZone ?? "Not set"}</dd>
          <dt>Working day starts</dt>
          <dd>{startHm ?? "Not set"}</dd>
        </dl>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <p className="admin-cell-muted u-sm u-mt-4 u-mb-1">
        Dates are for reference: the hub and portal access stay on after the end date until you turn them off.
        Time zone and working-day start are used to send client-review emails in this client&apos;s working day.
      </p>
    </div>
  );
}
