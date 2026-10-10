"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DetailDrawer } from "@/kernel/ui/DetailDrawer";
import type { MayProp } from "@/kernel/identity/may-prop";
import type { TeamPerson } from "@/kernel/identity/team-people";
import type { LegalEntityView } from "@/entities/org/lib/legal-entities";
import { checkCompany, checkRegistration, type CompanyInput, type LegalEntityRecord, type RegistrationInput } from "@/entities/org/lib/legal-entity-changes";
import { checkReason } from "@/entities/org/lib/legal-entity-rules";
import { updateLegalEntityCompany } from "./company-actions";
import { updateLegalEntityRegistration } from "./registration-actions";
import { CompanyFields, Field, RegistrationFields } from "./LegalEntityFields";
import { LegalEntityHistory } from "./LegalEntityHistory";

// The edit drawer for one legal entity: the company itself (a Super Admin's),
// its registration details (Finance's and a Super Admin's), one reason for
// whatever changed, and the history of earlier changes beneath. Save is
// enabled once something changed, every changed section passes the same
// checks the server runs, and a reason is given.

/**
 * What the drawer needs from the server: `may` answers org.legal-entities (the
 * Company section) and org.legal-registration (the registration details) for
 * the viewer (ADR 0014). Hiding is courtesy; each action's guard still refuses.
 */
export type DrawerContext = { may: MayProp; people: TeamPerson[]; today: string };

export const COMPANY_ATOM = "org.legal-entities";
export const REGISTRATION_ATOM = "org.legal-registration";

export function companyDraftOf(r: LegalEntityRecord): CompanyInput {
  return { name: r.name, legalName: r.legal_name ?? "", entityType: r.entity_type ?? "", baseCurrency: r.base_currency.toUpperCase(), active: r.active };
}

export function registrationDraftOf(r: LegalEntityRecord): RegistrationInput {
  return {
    taxId: r.tax_id ?? "",
    registrationNumber: r.registration_number ?? "",
    registeredAddress: r.registered_address ?? "",
    legalRepresentativePersonId: r.legal_representative_person_id ?? "",
    jurisdiction: r.jurisdiction ?? "",
    incorporatedOn: r.incorporated_on ?? "",
  };
}

const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

export function LegalEntityDrawer({
  entity,
  context,
  onClose,
  restoreFocus,
}: {
  entity: LegalEntityView | null;
  context: DrawerContext;
  onClose: () => void;
  restoreFocus: () => boolean;
}) {
  const r = entity?.record;
  return (
    <DetailDrawer
      open={!!entity}
      onClose={onClose}
      restoreFocus={restoreFocus}
      className="admin-legal-drawer"
      eyebrow={r ? [r.country, r.base_currency.toUpperCase(), entity?.typeLabel].filter(Boolean).join(" · ") : "Legal entity"}
      title={r?.name ?? ""}
    >
      {entity && <EditBody key={entity.record.id} entity={entity} context={context} onClose={onClose} />}
    </DetailDrawer>
  );
}

function EditBody({ entity, context, onClose }: { entity: LegalEntityView; context: DrawerContext; onClose: () => void }) {
  const router = useRouter();
  const { record } = entity;
  const [company, setCompany] = useState(() => companyDraftOf(record));
  const [registration, setRegistration] = useState(() => registrationDraftOf(record));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompany = context.may[COMPANY_ATOM] === true;
  const canRegister = context.may[REGISTRATION_ATOM] === true;
  const companyDirty = canCompany && !same(company, companyDraftOf(record));
  const registrationDirty = canRegister && !same(registration, registrationDraftOf(record));
  const companyCheck = companyDirty ? checkCompany(record, company) : null;
  const teamPeopleIds = new Set(context.people.map((p) => p.id));
  const registrationCheck = registrationDirty ? checkRegistration(record, registration, { today: context.today, teamPeopleIds }) : null;
  const reasonCheck = checkReason(reason);
  const canSave =
    !busy && (companyDirty || registrationDirty) && (companyCheck?.ok ?? true) && (registrationCheck?.ok ?? true) && reasonCheck.ok;

  const fieldErrors = (check: typeof companyCheck | typeof registrationCheck) => (check && !check.ok ? check.fields : {});
  const representative = record.legal_representative_person_id && entity.representative ? { id: record.legal_representative_person_id, name: entity.representative } : null;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    let companySaved = false;
    if (companyDirty) {
      const res = await updateLegalEntityCompany({ id: record.id, ...company, reason });
      if (!res.ok) {
        setBusy(false);
        setError(res.error);
        return;
      }
      companySaved = true;
    }
    if (registrationDirty) {
      const res = await updateLegalEntityRegistration({ id: record.id, ...registration, reason });
      if (!res.ok) {
        setBusy(false);
        setError(companySaved ? `The company was saved, but the registration details were not: ${res.error}` : res.error);
        router.refresh();
        return;
      }
    }
    setBusy(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="admin-shelf-sections">
      <section className="admin-legal-section" aria-labelledby="legal-company">
        <div className="admin-legal-section-head">
          <h2 className="admin-shelf-heading" id="legal-company">
            Company
          </h2>
          <span className="admin-legal-who">Super Admin</span>
        </div>
        <CompanyFields draft={company} current={record.entity_type} errors={fieldErrors(companyCheck)} disabled={!canCompany || busy} onChange={setCompany} />
        {!canCompany && <div className="admin-hint">Only a Super Admin changes the company itself.</div>}
      </section>

      <section className="admin-legal-section" aria-labelledby="legal-registration">
        <div className="admin-legal-section-head">
          <h2 className="admin-shelf-heading" id="legal-registration">
            Registration details
          </h2>
          <span className="admin-legal-who">Finance · Super Admin</span>
        </div>
        <RegistrationFields
          country={record.country}
          draft={registration}
          errors={fieldErrors(registrationCheck)}
          people={context.people}
          representative={representative}
          today={context.today}
          disabled={!canRegister || busy}
          onChange={setRegistration}
        />
      </section>

      <Field label="Why are you changing it?" hint="Required. It is kept with the change, beside your name." error={reason !== "" && !reasonCheck.ok ? reasonCheck.error : null}>
        {(a) => <textarea className="admin-textarea admin-legal-address" value={reason} placeholder="e.g. From the business registration certificate" onChange={(e) => setReason(e.target.value)} {...a} />}
      </Field>

      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn admin-btn--primary" disabled={!canSave} onClick={save}>
          {busy ? "Saving…" : "Save change"}
        </button>
        <button type="button" className="admin-btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>

      <section aria-labelledby="legal-history">
        <h2 className="admin-shelf-heading" id="legal-history">
          History
        </h2>
        <LegalEntityHistory changes={entity.history} />
      </section>
    </div>
  );
}
