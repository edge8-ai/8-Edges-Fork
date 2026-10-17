"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IdUpload } from "@/entities/team/ui/IdUpload";
import { saveOwnProfile, type ProfileInput } from "./actions";

type UploadResult = { ok: true } | { ok: false; error: string };

// Everything the employee can edit about themselves, in one form across three
// sections (Personal, Contact, Private). Text fields save together via the one
// Save button; the two ID images upload immediately on pick (IdUpload).
export function ProfileEditor({
  initial,
  hasIdFront,
  hasIdBack,
  idFrontAction,
  idBackAction,
}: {
  initial: ProfileInput;
  hasIdFront: boolean;
  hasIdBack: boolean;
  idFrontAction: (formData: FormData) => Promise<UploadResult>;
  idBackAction: (formData: FormData) => Promise<UploadResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [v, setV] = useState<ProfileInput>(initial);

  function set<K extends keyof ProfileInput>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setV((s) => ({ ...s, [key]: e.target.value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    startTransition(async () => {
      const res = await saveOwnProfile(v);
      if (res.ok) {
        setBanner({ tone: "ok", text: "Saved." });
        router.refresh();
      } else {
        setBanner({ tone: "err", text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="admin-team-profile-stack">
        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title">Personal</h2>
          <p className="admin-page-sub u-mt-0">Yours to keep up to date.</p>
          <div className="admin-profile-fields">
            <div className="admin-profile-row" style={{ ["--n" as string]: 3 }} /* layout-ok: column count drives a CSS variable */>
              <Field label="Gender">
                <select className="admin-input" value={v.gender} onChange={set("gender")}>
                  <option value="">—</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Date of birth">
                <input className="admin-input" type="date" value={v.dateOfBirth} onChange={set("dateOfBirth")} />
              </Field>
              <Field label="Marital status">
                <select className="admin-input" value={v.maritalStatus} onChange={set("maritalStatus")}>
                  <option value="">—</option>
                  <option>Single</option>
                  <option>Married</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>
            <div className="admin-profile-row">
              <Field label="Hometown">
                <input className="admin-input" value={v.hometown} onChange={set("hometown")} placeholder="Where you're from" />
              </Field>
              <Field label="Education">
                <input className="admin-input" value={v.education} onChange={set("education")} placeholder="Where you studied" />
              </Field>
            </div>
            <div className="admin-field">
              <span className="admin-label">Hobbies</span>
              <ChipInput values={v.hobbies} onChange={(hobbies) => setV((s) => ({ ...s, hobbies }))} />
            </div>
          </div>
        </section>

        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title">Contact</h2>
          <div className="admin-profile-fields">
            <div className="admin-profile-row" style={{ ["--n" as string]: 3 }} /* layout-ok: column count drives a CSS variable */>
              <Field label="Preferred name">
                <input className="admin-input" value={v.preferredName} onChange={set("preferredName")} placeholder="What you like to be called" />
              </Field>
              <Field label="Phone">
                <input className="admin-input" type="tel" value={v.phone} onChange={set("phone")} />
              </Field>
              <Field label="Personal email">
                <input className="admin-input" type="email" value={v.personalEmail} onChange={set("personalEmail")} placeholder="name@gmail.com" />
              </Field>
            </div>
            <div className="admin-profile-row">
              <Field label="Emergency contact">
                <input className="admin-input" value={v.emergencyContactName} onChange={set("emergencyContactName")} placeholder="Name" />
              </Field>
              <Field label="Their phone">
                <input className="admin-input" type="tel" value={v.emergencyContactPhone} onChange={set("emergencyContactPhone")} />
              </Field>
            </div>
          </div>
        </section>

        <section className="admin-card admin-section-card">
          <h2 className="admin-card-title admin-team-lock-title">
            Private · payroll, ID and address
            <span className="admin-team-lock" aria-hidden>🔒</span>
          </h2>
          <p className="admin-page-sub u-mt-0">
            Only you and HR see this. We email you if bank details change.
          </p>
          <div className="admin-profile-fields">
            <div className="admin-profile-row">
              <Field label="Current address">
                <input className="admin-input" value={v.currentAddress} onChange={set("currentAddress")} />
              </Field>
              <Field label="Permanent address">
                <input className="admin-input" value={v.permanentAddress} onChange={set("permanentAddress")} />
              </Field>
            </div>
            <div className="admin-profile-row" style={{ ["--n" as string]: 5 }} /* layout-ok: column count drives a CSS variable */>
              <Field label="Bank" span={2}>
                <input className="admin-input" value={v.bankName} onChange={set("bankName")} />
              </Field>
              <Field label="Account number" span={3}>
                <input className="admin-input" value={v.bankAccountNumber} onChange={set("bankAccountNumber")} />
              </Field>
            </div>
            <div className="admin-profile-row" style={{ ["--n" as string]: 3 }} /* layout-ok: column count drives a CSS variable */>
              <Field label="Branch">
                <input className="admin-input" value={v.bankBranch} onChange={set("bankBranch")} />
              </Field>
              <Field label="Tax / PIT code">
                <input className="admin-input" value={v.taxCode} onChange={set("taxCode")} />
              </Field>
              <Field label="Social insurance no.">
                <input className="admin-input" value={v.socialInsuranceNumber} onChange={set("socialInsuranceNumber")} />
              </Field>
            </div>
            <div className="admin-profile-row" style={{ ["--n" as string]: 4 }} /* layout-ok: column count drives a CSS variable */>
              <Field label="National ID / passport no." span={2}>
                <input className="admin-input" value={v.nationalIdNumber} onChange={set("nationalIdNumber")} />
              </Field>
              <Field label="Issued">
                <input className="admin-input" type="date" value={v.nationalIdIssueDate} onChange={set("nationalIdIssueDate")} />
              </Field>
              <Field label="Place">
                <input className="admin-input" value={v.nationalIdIssuePlace} onChange={set("nationalIdIssuePlace")} />
              </Field>
            </div>
            <div className="admin-field">
              <span className="admin-label">ID card images</span>
              <div className="admin-team-id-slots">
                <IdUpload label="Front" side="front" hasImage={hasIdFront} action={idFrontAction} />
                <IdUpload label="Back" side="back" hasImage={hasIdBack} action={idBackAction} />
              </div>
            </div>
          </div>
        </section>

        {banner && (
          <div className={`admin-alert admin-alert--${banner.tone === "ok" ? "ok" : "err"}`}>
            {banner.text}
          </div>
        )}
        <div className="admin-team-profile-save">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, span, children }: { label: string; span?: number; children: React.ReactNode }) {
  return (
    <div className="admin-field" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <span className="admin-label">{label}</span>
      {children}
    </div>
  );
}

// Add-on-Enter/comma chip editor for hobbies. Empty entries are dropped; a
// duplicate is ignored. Keeps a controlled string[] in the parent form.
function ChipInput({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const t = draft.trim().replace(/,$/, "").trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  }
  return (
    <div className="admin-team-chipinput">
      {values.map((h) => (
        <span className="admin-team-chip is-editable" key={h}>
          {h}
          <button type="button" className="admin-team-chip-x" aria-label={`Remove ${h}`} onClick={() => onChange(values.filter((x) => x !== h))}>×</button>
        </span>
      ))}
      <input
        className="admin-team-chipinput-field"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
          else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        placeholder={values.length ? "" : "Add a hobby"}
      />
    </div>
  );
}
