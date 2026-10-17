"use client";

import { updatePerson } from "@/entities/crm/lib/contacts-actions";
import type { Person } from "@/entities/crm/lib/contacts";
import { COUNTRIES } from "@/entities/company-os/client";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";

// Known persona values (company_os has no enum on people.persona). "" = Unset.
const PERSONA_OPTIONS = [
  { value: "", label: "Unset" },
  { value: "job_seeker", label: "Job seeker" },
  { value: "prospect", label: "Prospect" },
  { value: "client", label: "Client" },
  { value: "employee", label: "Employee" },
];

export function PersonEditForm({ person, onDone }: { person: Person; onDone?: () => void }) {
  const { form, field, commit, status } = useAutosave(
    {
      full_name: person.full_name ?? "",
      phone: person.phone ?? "",
      persona: person.persona ?? "",
      country: person.country ?? "",
      linkedin_url: person.linkedin_url ?? "",
      notes: person.notes ?? "",
      do_not_contact: !!person.do_not_contact,
    },
    (patch) => updatePerson(person.id, patch),
  );

  return (
    <div className="admin-form">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>
      <div className="admin-field">
        <label className="admin-label">Full name</label>
        <input
          className="admin-input"
          value={form.full_name}
          onChange={(e) => field("full_name", e.target.value)}
          onBlur={(e) => commit("full_name", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Phone</label>
        <input
          className="admin-input"
          value={form.phone}
          onChange={(e) => field("phone", e.target.value)}
          onBlur={(e) => commit("phone", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Persona</label>
        <select
          className="admin-input"
          value={form.persona}
          onChange={(e) => {
            field("persona", e.target.value);
            commit("persona", e.target.value);
          }}
        >
          {PERSONA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {form.persona && !PERSONA_OPTIONS.some((o) => o.value === form.persona) && (
            <option value={form.persona}>{form.persona}</option>
          )}
        </select>
      </div>
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
        <label className="admin-label">LinkedIn</label>
        <input
          className="admin-input"
          value={form.linkedin_url}
          onChange={(e) => field("linkedin_url", e.target.value)}
          onBlur={(e) => commit("linkedin_url", e.target.value)}
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Notes</label>
        <textarea
          className="admin-textarea"
          value={form.notes}
          onChange={(e) => field("notes", e.target.value)}
          onBlur={(e) => commit("notes", e.target.value)}
        />
      </div>
      <label className="u-row">
        <input
          type="checkbox"
          checked={form.do_not_contact}
          onChange={(e) => {
            field("do_not_contact", e.target.checked);
            commit("do_not_contact", e.target.checked);
          }}
        />
        <span className="admin-label">
          Do not contact
        </span>
      </label>
      {status.state === "error" && (
        <div className="admin-alert admin-alert--err">{status.error}</div>
      )}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
