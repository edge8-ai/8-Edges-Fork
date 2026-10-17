"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/kernel/ui/format";
import { Badge } from "@/kernel/ui/Badge";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { archiveRenewal, saveRenewal } from "@/entities/crm/lib/renewal-actions";
import {
  RENEWAL_SOON_DAYS,
  RENEWAL_STATUSES,
  RENEWAL_STATUS_LABEL,
  renewalDistance,
  renewalDueSoon,
  type Renewal,
  type RenewalStatus,
} from "@/entities/crm/lib/renewal-vocab";

// The account's live renewal on the company page (S.6). Read-only until Edit,
// like the Details and Client relationship cards. Saving edits the live
// renewal; "Start next renewal" archives it (the row stays as history) so the
// following term can be entered once this one is recorded as renewed or lost.
// `today` comes from the server so the distance text renders the same on both
// sides of hydration.
export function RenewalCard({ companyId, renewal, today }: { companyId: string; renewal: Renewal | null; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const term = String(form.get("term_months") ?? "").trim();
    setSaving(true);
    setError(null);
    const r = await saveRenewal({
      companyId,
      renewsOn: String(form.get("renews_on") ?? ""),
      termMonths: term ? Number(term) : null,
      status: String(form.get("status")) as RenewalStatus,
      note: String(form.get("note") ?? ""),
    });
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  const soon = renewalDueSoon(renewal, today);

  return (
    <div className="admin-card admin-section-card">
      <div className="admin-card-head">
        <h2 className="admin-card-title">Renewal</h2>
        <button type="button" className="admin-btn" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : renewal ? "Edit" : "Set renewal"}
        </button>
      </div>
      {editing ? (
        <form onSubmit={onSubmit} className="u-stack u-gap-3">
          <div className="u-grid-2 u-gap-3">
            <div className="admin-field">
              <label className="admin-label" htmlFor="renews_on">Renews on</label>
              <input id="renews_on" name="renews_on" type="date" required className="admin-input" defaultValue={renewal?.renews_on ?? ""} />
            </div>
            <div className="admin-field">
              <label className="admin-label" htmlFor="term_months">Term (months)</label>
              <input id="term_months" name="term_months" type="number" min={1} max={120} className="admin-input" defaultValue={renewal?.term_months ?? ""} />
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="renewal_status">Status</label>
            <select id="renewal_status" name="status" className="admin-select" defaultValue={renewal?.status ?? "upcoming"}>
              {RENEWAL_STATUSES.map((s) => (
                <option key={s} value={s}>{RENEWAL_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor="renewal_note">Note</label>
            <textarea id="renewal_note" name="note" rows={2} maxLength={1000} className="admin-textarea" defaultValue={renewal?.note ?? ""} />
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save renewal"}
            </button>
          </div>
        </form>
      ) : renewal ? (
        <dl className="admin-kv">
          <dt>Renews on</dt>
          <dd>
            {formatDate(renewal.renews_on)} <span className="admin-cell-muted">({renewalDistance(renewal.renews_on, today)})</span>
            {soon && <> <Badge tone="warn">Within {RENEWAL_SOON_DAYS} days</Badge></>}
          </dd>
          <dt>Term</dt>
          <dd>{renewal.term_months ? `${renewal.term_months} months` : "—"}</dd>
          <dt>Status</dt>
          <dd>{RENEWAL_STATUS_LABEL[renewal.status]}</dd>
          {renewal.note && (
            <>
              <dt>Note</dt>
              <dd>{renewal.note}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="admin-cell-muted">No renewal date set.</p>
      )}
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {renewal && !editing && renewal.status !== "upcoming" && (
        <div className="admin-form-actions u-mt-4">
          <ConfirmButton
            className="admin-btn"
            label="Start next renewal"
            title="Start the next renewal?"
            body="This renewal is kept as history and the company has no renewal date until you set the next one."
            confirmLabel="Start next renewal"
            onConfirm={() => archiveRenewal(companyId, renewal.id)}
            onDone={() => router.refresh()}
          />
        </div>
      )}
    </div>
  );
}
