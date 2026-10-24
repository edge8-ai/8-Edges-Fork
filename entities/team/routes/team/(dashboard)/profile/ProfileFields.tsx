"use client";

// The two cards under the postcard on My Profile (TH.9): the person's details
// and their payroll, ID and address, as plain grouped fields. Nothing here is
// on the postcard. Each group is a fieldset with its own heading, and each
// field says what it holds (type, autocomplete, inputmode), so a phone offers
// the right keyboard and a browser can fill what it knows.
import { useId, type ChangeEvent, type ReactNode } from "react";
import { IdUpload } from "@/entities/team/ui/IdUpload";
import type { ProfileInput } from "./actions";

type UploadResult = { ok: true } | { ok: false; error: string };
type Setter = <K extends keyof ProfileInput>(key: K) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;

// The label names its field (OV.6.2): a screen reader announced all 21 fields
// of this form with no name, because the visible text sat in a span bound to
// nothing. The child receives the id its label points at.
function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`pe-field${wide ? " pe-wide" : ""}`}>
      <label className="pe-label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="pe-hint">{hint}</p>}
    </div>
  );
}

function Group({ legend, cols = 3, children }: { legend: string; cols?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <fieldset className="pe-set">
      <legend>{legend}</legend>
      <div className={`pe-grid pe-grid-${cols}`}>{children}</div>
    </fieldset>
  );
}

export function ProfileFields({
  v,
  set,
  workEmail,
  hasIdFront,
  hasIdBack,
  idFrontAction,
  idBackAction,
}: {
  v: ProfileInput;
  set: Setter;
  workEmail: string | null;
  hasIdFront: boolean;
  hasIdBack: boolean;
  idFrontAction: (formData: FormData) => Promise<UploadResult>;
  idBackAction: (formData: FormData) => Promise<UploadResult>;
}) {
  return (
    <>
      <section className="pe-card" aria-labelledby="pe-details-h">
        <h2 className="pe-h" id="pe-details-h">Your details</h2>
        <p className="pe-sub">Kept on file. Not on your postcard.</p>
        <Group legend="Contact">
          {workEmail && (
            <div className="pe-field">
              <span className="pe-label">Work email</span>
              <span className="pe-ro">{workEmail}</span>
            </div>
          )}
          <Field label="Phone">{(id) => <input id={id} className="pe-input" type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set("phone")} />}</Field>
          <Field label="Personal email">
            {(id) => <input id={id} className="pe-input" type="email" autoComplete="email" value={v.personalEmail} onChange={set("personalEmail")} placeholder="name@gmail.com" />}
          </Field>
        </Group>
        <Group legend="In an emergency" cols={2}>
          <Field label="Who to call">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.emergencyContactName} onChange={set("emergencyContactName")} placeholder="Name" />}</Field>
          <Field label="Their phone">{(id) => <input id={id} className="pe-input" type="tel" inputMode="tel" autoComplete="off" value={v.emergencyContactPhone} onChange={set("emergencyContactPhone")} />}</Field>
        </Group>
        <Group legend="About you" cols={4}>
          <Field label="Preferred name" hint="What teammates call you.">
            {(id) => <input id={id} className="pe-input" autoComplete="nickname" value={v.preferredName} onChange={set("preferredName")} />}
          </Field>
          <Field label="Date of birth">{(id) => <input id={id} className="pe-input" type="date" autoComplete="bday" value={v.dateOfBirth} onChange={set("dateOfBirth")} />}</Field>
          <Field label="Gender">
            {(id) => (
              <select id={id} className="pe-input" value={v.gender} onChange={set("gender")}>
                <option value="">—</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            )}
          </Field>
          <Field label="Marital status">
            {(id) => (
              <select id={id} className="pe-input" value={v.maritalStatus} onChange={set("maritalStatus")}>
                <option value="">—</option>
                <option>Single</option>
                <option>Married</option>
                <option>Other</option>
              </select>
            )}
          </Field>
        </Group>
      </section>

      <section className="pe-card" aria-labelledby="pe-pay-h">
        <h2 className="pe-h" id="pe-pay-h">Payroll, ID and address</h2>
        <p className="pe-sub">Used to pay you. We email you whenever your bank details change.</p>
        <Group legend="Bank">
          <Field label="Bank">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.bankName} onChange={set("bankName")} />}</Field>
          <Field label="Account number">{(id) => <input id={id} className="pe-input" inputMode="numeric" autoComplete="off" value={v.bankAccountNumber} onChange={set("bankAccountNumber")} />}</Field>
          <Field label="Branch">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.bankBranch} onChange={set("bankBranch")} />}</Field>
        </Group>
        <Group legend="Tax and insurance" cols={2}>
          <Field label="Tax / PIT code">{(id) => <input id={id} className="pe-input" inputMode="numeric" autoComplete="off" value={v.taxCode} onChange={set("taxCode")} />}</Field>
          <Field label="Social insurance no.">{(id) => <input id={id} className="pe-input" inputMode="numeric" autoComplete="off" value={v.socialInsuranceNumber} onChange={set("socialInsuranceNumber")} />}</Field>
        </Group>
        <Group legend="ID card or passport">
          <Field label="Number">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.nationalIdNumber} onChange={set("nationalIdNumber")} />}</Field>
          <Field label="Issued on">{(id) => <input id={id} className="pe-input" type="date" autoComplete="off" value={v.nationalIdIssueDate} onChange={set("nationalIdIssueDate")} />}</Field>
          <Field label="Issued in">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.nationalIdIssuePlace} onChange={set("nationalIdIssuePlace")} />}</Field>
          <div className="pe-field pe-wide">
            <span className="pe-label">Photos of the card</span>
            <div className="admin-team-id-slots">
              <IdUpload label="Front" side="front" hasImage={hasIdFront} action={idFrontAction} />
              <IdUpload label="Back" side="back" hasImage={hasIdBack} action={idBackAction} />
            </div>
          </div>
        </Group>
        <Group legend="Address" cols={2}>
          <Field label="Where you live now">{(id) => <input id={id} className="pe-input" autoComplete="street-address" value={v.currentAddress} onChange={set("currentAddress")} />}</Field>
          <Field label="Permanent address">{(id) => <input id={id} className="pe-input" autoComplete="off" value={v.permanentAddress} onChange={set("permanentAddress")} />}</Field>
        </Group>
      </section>
    </>
  );
}
