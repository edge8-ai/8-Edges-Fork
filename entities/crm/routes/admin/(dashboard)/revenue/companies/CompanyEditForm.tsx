"use client";

import { INDUSTRY_CATEGORIES, SIZE_BANDS, PRIORITY_LEVELS } from "@/entities/crm/lib/company-enums";
import { COUNTRIES } from "@/entities/company-os/client";
import { humanize } from "@/kernel/ui/format";
import { updateCompany, type CompanyPatch } from "@/entities/crm/lib/companies-actions";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";

export type EditableCompany = {
  id: string;
  name: string | null;
  website_url: string | null;
  industry_normalized?: string | null;
  size_band: string | null;
  country: string | null;
  priority: string | null;
  notes?: string | null;
};

// Shared basics form. `showNotes` gates the notes field so the compact list
// drawer (which doesn't render it) can't send a stray notes patch — autosave
// only ever commits a field the user actually touched, so this can't blank it.
export function CompanyEditForm({
  company,
  showNotes = false,
  onDone,
}: {
  company: EditableCompany;
  showNotes?: boolean;
  onDone?: () => void;
}) {
  const { form, field, commit, status } = useAutosave(
    {
      name: company.name ?? "",
      website_url: company.website_url ?? "",
      industry_normalized: company.industry_normalized ?? "",
      size_band: company.size_band ?? "",
      country: company.country ?? "",
      priority: company.priority ?? "",
      notes: company.notes ?? "",
    },
    (patch: CompanyPatch) => updateCompany(company.id, patch),
  );

  return (
    <div className="admin-form">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>
      <div className="admin-field">
        <label className="admin-label">Name</label>
        <input
          className="admin-input"
          value={form.name}
          onChange={(e) => field("name", e.target.value)}
          onBlur={(e) => commit("name", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Website URL</label>
        <input
          className="admin-input"
          value={form.website_url}
          onChange={(e) => field("website_url", e.target.value)}
          onBlur={(e) => commit("website_url", e.target.value)}
          placeholder="acme.com"
        />
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Industry</label>
          <select
            className="admin-input"
            value={form.industry_normalized}
            onChange={(e) => {
              field("industry_normalized", e.target.value);
              commit("industry_normalized", e.target.value);
            }}
          >
            <option value="">—</option>
            {/* Preserve a legacy value outside the canonical list rather than blank it. */}
            {form.industry_normalized && !(INDUSTRY_CATEGORIES as readonly string[]).includes(form.industry_normalized) && (
              <option value={form.industry_normalized}>{form.industry_normalized}</option>
            )}
            {INDUSTRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Size (employees)</label>
          <select
            className="admin-input"
            value={form.size_band}
            onChange={(e) => {
              field("size_band", e.target.value);
              commit("size_band", e.target.value);
            }}
          >
            <option value="">—</option>
            {SIZE_BANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="u-grid-2 u-gap-3">
        <div className="admin-field">
          <label className="admin-label">Country</label>
          <select
            className="admin-input"
            value={form.country}
            onChange={(e) => {
              field("country", e.target.value);
              commit("country", e.target.value);
            }}
          >
            <option value="">—</option>
            {/* Preserve an existing value that isn't in the canonical list. */}
            {form.country && !(COUNTRIES as readonly string[]).includes(form.country) && (
              <option value={form.country}>{form.country}</option>
            )}
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Priority</label>
          <select
            className="admin-input"
            value={form.priority}
            onChange={(e) => {
              field("priority", e.target.value);
              commit("priority", e.target.value);
            }}
          >
            <option value="">—</option>
            {PRIORITY_LEVELS.map((p) => (
              <option key={p} value={p}>{humanize(p)}</option>
            ))}
          </select>
        </div>
      </div>
      {showNotes && (
        <div className="admin-field">
          <label className="admin-label">Notes</label>
          <textarea
            className="admin-textarea"
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
            onBlur={(e) => commit("notes", e.target.value)}
          />
        </div>
      )}
      {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      {onDone && (
        <div className="admin-form-actions">
          <button type="button" className="admin-btn" onClick={onDone}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
