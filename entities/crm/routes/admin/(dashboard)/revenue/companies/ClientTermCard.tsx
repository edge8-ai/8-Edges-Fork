"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { updateCompany } from "@/entities/crm/lib/companies-actions";

type Field = "client_start_date" | "client_end_date";

// The client relationship's start and end dates. Read-only until Edit, like the
// Details card. Each field is a date picker; the value is the stored
// "YYYY-MM-DD", and an empty field clears the date.
export function ClientTermCard({
  companyId,
  startDate,
  endDate,
}: {
  companyId: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(field: Field, input: HTMLInputElement, current: string | null) {
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
        </div>
      ) : (
        <dl className="admin-kv">
          <dt>Start date</dt>
          <dd>{formatDate(startDate)}</dd>
          <dt>End date</dt>
          <dd>{endDate ? formatDate(endDate) : "Open-ended"}</dd>
        </dl>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <p className="admin-cell-muted u-sm u-mt-4 u-mb-1">
        Dates are for reference: the hub and portal access stay on after the end date until you turn them off.
      </p>
    </div>
  );
}
