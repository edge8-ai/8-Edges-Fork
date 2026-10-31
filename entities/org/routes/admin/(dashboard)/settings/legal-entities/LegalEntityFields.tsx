"use client";

import { useId, type ReactNode } from "react";
import type { TeamPerson } from "@/kernel/identity/team-people";
import { ENTITY_TYPES, countryLabels, entityTypeLabel } from "@/entities/org/lib/legal-entity-rules";
import type { CompanyInput, RegistrationInput } from "@/entities/org/lib/legal-entity-changes";

// The two sections of the edit drawer, as plain controlled fields. They hold
// no state and make no calls: the drawer owns the drafts, runs the shared
// checks, and hands each field its error.

/** One labelled control with its hint or error under it, tied together for assistive technology. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | null;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint ?? null;
  return (
    <div className="admin-field">
      <label className="admin-label" htmlFor={id}>
        {label}
      </label>
      {children({ id, ...(note ? { "aria-describedby": noteId } : {}), ...(error ? { "aria-invalid": true as const } : {}) })}
      {note && (
        <div id={noteId} className={error ? "admin-legal-error" : "admin-hint"}>
          {note}
        </div>
      )}
    </div>
  );
}

/** The type picker: the known forms, plus whatever is already stored so an edit never forces a change. */
export function EntityTypeSelect({ value, current, onChange, disabled, ...rest }: { value: string; current: string | null; onChange: (v: string) => void; disabled?: boolean; id: string }) {
  const types: string[] = [...ENTITY_TYPES];
  if (current && !types.includes(current)) types.push(current);
  return (
    <select className="admin-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} {...rest}>
      {value === "" && <option value="">Choose a type…</option>}
      {types.map((t) => (
        <option key={t} value={t}>
          {entityTypeLabel(t)}
        </option>
      ))}
    </select>
  );
}

export function CompanyFields({
  draft,
  current,
  errors,
  disabled,
  onChange,
}: {
  draft: CompanyInput;
  current: string | null;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (next: CompanyInput) => void;
}) {
  const set = (patch: Partial<CompanyInput>) => onChange({ ...draft, ...patch });
  return (
    <>
      <Field label="Name" hint="What the organisation calls it." error={errors.name}>
        {(a) => <input className="admin-input" value={draft.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} {...a} />}
      </Field>
      <Field label="Registered legal name" hint="Exactly as on the registration certificate." error={errors.legalName}>
        {(a) => <input className="admin-input" value={draft.legalName} disabled={disabled} onChange={(e) => set({ legalName: e.target.value })} {...a} />}
      </Field>
      <div className="u-grid-2 u-gap-3">
        <Field label="Type" error={errors.entityType}>
          {(a) => <EntityTypeSelect value={draft.entityType} current={current} disabled={disabled} onChange={(v) => set({ entityType: v })} {...a} />}
        </Field>
        <Field label="Currency" error={errors.baseCurrency}>
          {(a) => (
            <input className="admin-input" value={draft.baseCurrency} maxLength={3} disabled={disabled} onChange={(e) => set({ baseCurrency: e.target.value.toUpperCase() })} {...a} />
          )}
        </Field>
      </div>
      <label className="admin-legal-check">
        <input type="checkbox" checked={draft.active} disabled={disabled} onChange={(e) => set({ active: e.target.checked })} />
        Active
      </label>
    </>
  );
}

export function RegistrationFields({
  country,
  draft,
  errors,
  people,
  representative,
  today,
  disabled,
  onChange,
}: {
  disabled: boolean;
  country: string | null;
  draft: RegistrationInput;
  errors: Record<string, string>;
  people: TeamPerson[];
  /** The person named now, kept in the list even when they are no longer on the team. */
  representative: { id: string; name: string } | null;
  today: string;
  onChange: (next: RegistrationInput) => void;
}) {
  const labels = countryLabels(country);
  const set = (patch: Partial<RegistrationInput>) => onChange({ ...draft, ...patch });
  const options = representative && !people.some((p) => p.id === representative.id) ? [{ ...representative, name: `${representative.name} (no longer on the team)` }, ...people] : people;
  const asOnCertificate = "Copied exactly as it appears on the registration certificate.";
  // One `disabled` on the fieldset makes every control in it read-only.
  return (
    <fieldset className="admin-form" disabled={disabled}>
      <Field label={labels.taxId.label} hint={labels.taxId.rule ?? asOnCertificate} error={errors.taxId}>
        {(a) => <input className="admin-input admin-cell-mono" value={draft.taxId} placeholder={labels.taxId.placeholder} onChange={(e) => set({ taxId: e.target.value })} {...a} />}
      </Field>
      <Field label={labels.registrationNumber.label} hint={labels.registrationNumber.rule ?? asOnCertificate} error={errors.registrationNumber}>
        {(a) => (
          <input
            className="admin-input admin-cell-mono"
            value={draft.registrationNumber}
            placeholder={labels.registrationNumber.placeholder}
            onChange={(e) => set({ registrationNumber: e.target.value })}
            {...a}
          />
        )}
      </Field>
      <Field label="Registered address" error={errors.registeredAddress}>
        {(a) => (
          <textarea className="admin-textarea admin-legal-address" value={draft.registeredAddress} placeholder="As on the registration certificate" onChange={(e) => set({ registeredAddress: e.target.value })} {...a} />
        )}
      </Field>
      <Field label="Legal representative" error={errors.legalRepresentativePersonId}>
        {(a) => (
          <select className="admin-select" value={draft.legalRepresentativePersonId} onChange={(e) => set({ legalRepresentativePersonId: e.target.value })} {...a}>
            <option value="">Choose a person…</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="u-grid-2 u-gap-3">
        <Field label={labels.jurisdiction.label} error={errors.jurisdiction}>
          {(a) => <input className="admin-input" value={draft.jurisdiction} placeholder={labels.jurisdiction.placeholder} onChange={(e) => set({ jurisdiction: e.target.value })} {...a} />}
        </Field>
        <Field label="Incorporated on" error={errors.incorporatedOn}>
          {(a) => <input type="date" className="admin-input" value={draft.incorporatedOn} max={today} onChange={(e) => set({ incorporatedOn: e.target.value })} {...a} />}
        </Field>
      </div>
    </fieldset>
  );
}
