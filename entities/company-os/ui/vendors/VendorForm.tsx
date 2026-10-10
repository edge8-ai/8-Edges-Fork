"use client";

import { useState } from "react";
import type { VendorInput } from "./vendor-shared";
import { VendorFields } from "./VendorFields";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";

export type VendorFormValues = VendorInput;
type SaveResult = { ok: true } | { ok: false; error: string };

const EMPTY: VendorFormValues = {
  type: "other",
  name: "",
  price_range: "",
  address: "",
  phone: "",
  tax_id: "",
  bank_info: "",
  primary_contact_name: "",
  primary_contact_email: "",
  primary_contact_phone: "",
  secondary_contact_name: "",
  secondary_contact_email: "",
  secondary_contact_phone: "",
  rating: "",
  url: "",
  notes: "",
};

// Full vendor field set, shared by the "New vendor" page (a single explicit
// submit — there's no record to patch yet) and the shelf's edit mode, which
// passes `autosave` to persist each field on blur/change instead. The team
// surface's "New vendor" page passes `hideFinancial`; it never edits, so only
// the submit form takes it.
export function VendorForm({
  initial,
  submitLabel,
  onSubmit,
  autosave,
  hideFinancial,
}: {
  initial?: Partial<VendorFormValues>;
  submitLabel?: string;
  onSubmit?: (values: VendorFormValues) => Promise<SaveResult>;
  autosave?: { onField: (patch: Partial<VendorFormValues>) => Promise<SaveResult>; onDone?: () => void };
  hideFinancial?: boolean;
}) {
  if (autosave) {
    return <VendorAutosaveForm initial={{ ...EMPTY, ...initial }} autosave={autosave} />;
  }
  return (
    <VendorSubmitForm
      initial={{ ...EMPTY, ...initial }}
      submitLabel={submitLabel ?? "Save"}
      onSubmit={onSubmit!}
      hideFinancial={hideFinancial}
    />
  );
}

function VendorSubmitForm({
  initial,
  submitLabel,
  onSubmit,
  hideFinancial,
}: {
  initial: VendorFormValues;
  submitLabel: string;
  onSubmit: (values: VendorFormValues) => Promise<SaveResult>;
  hideFinancial?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<VendorFormValues>(initial);

  function field<K extends keyof VendorFormValues>(key: K, value: VendorFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const r = await onSubmit(form);
    setSaving(false);
    if (!r.ok) setMsg({ ok: false, text: r.error });
  }

  return (
    <form className="admin-form" onSubmit={save}>
      {msg && <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"}`}>{msg.text}</div>}
      <VendorFields form={form} onChange={field} onBlur={() => {}} hideFinancial={hideFinancial} />
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function VendorAutosaveForm({
  initial,
  autosave,
}: {
  initial: VendorFormValues;
  autosave: { onField: (patch: Partial<VendorFormValues>) => Promise<SaveResult>; onDone?: () => void };
}) {
  const { form, field, commit, status } = useAutosave(initial, autosave.onField);

  return (
    <div className="admin-form">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>
      <VendorFields form={form} onChange={field} onBlur={commit} />
      {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={autosave.onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
