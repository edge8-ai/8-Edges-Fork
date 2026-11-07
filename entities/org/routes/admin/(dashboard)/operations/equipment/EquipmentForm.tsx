"use client";

import { useState } from "react";
import { humanize } from "@/kernel/ui/format";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";
import type { VendorOption } from "@/entities/org/lib/equipment";
import {
  EQUIPMENT_CONDITIONS,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  SPEC_TYPES,
  statusLabel,
  type EquipmentStatus,
  type EquipmentType,
} from "@/entities/org/lib/equipment-shared";
import type { EquipmentInput } from "./actions";

export type EquipmentFormValues = EquipmentInput;
type SaveResult = { ok: true } | { ok: false; error: string };

const EMPTY: EquipmentFormValues = {
  type: "laptop",
  name: "",
  brand: "",
  model: "",
  serial_number: "",
  processor: "",
  ram: "",
  storage: "",
  screen_size: "",
  purchase_date: "",
  model_year: "",
  vendor_id: "",
  vendor_name_raw: "",
  invoice_ref: "",
  cost_vnd: "",
  cost_usd: "",
  status: "in_stock",
  condition: "",
  notes: "",
  image_url: "",
};

// Full equipment field set, shared by the "New equipment" page (one explicit
// submit, there's no record to patch yet) and the shelf's edit mode, which
// passes `autosave` to persist each field on blur instead.
export function EquipmentForm({
  initial,
  vendors,
  submitLabel,
  onSubmit,
  autosave,
}: {
  initial?: Partial<EquipmentFormValues>;
  vendors: VendorOption[];
  submitLabel?: string;
  onSubmit?: (values: EquipmentFormValues) => Promise<SaveResult>;
  autosave?: { onField: (patch: Partial<EquipmentFormValues>) => Promise<SaveResult>; onDone?: () => void };
}) {
  if (autosave) {
    return <EquipmentAutosaveForm initial={{ ...EMPTY, ...initial }} vendors={vendors} autosave={autosave} />;
  }
  return (
    <EquipmentSubmitForm
      initial={{ ...EMPTY, ...initial }}
      vendors={vendors}
      submitLabel={submitLabel ?? "Save"}
      onSubmit={onSubmit!}
    />
  );
}

function EquipmentFields({
  form,
  onChange,
  onBlur,
  vendors,
}: {
  form: EquipmentFormValues;
  onChange: <K extends keyof EquipmentFormValues>(key: K, value: EquipmentFormValues[K]) => void;
  onBlur: <K extends keyof EquipmentFormValues>(key: K, value: EquipmentFormValues[K]) => void;
  vendors: VendorOption[];
}) {
  const two = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
  const three = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } as const;
  // Specs only make sense for machines. A mouse shouldn't ask for a processor.
  const showSpecs = SPEC_TYPES.includes(form.type);

  function text<K extends keyof EquipmentFormValues>(key: K, label: string, placeholder?: string) {
    return (
      <div className="admin-field">
        <label className="admin-label">{label}</label>
        <input
          className="admin-input"
          value={(form[key] as string) ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange(key, e.target.value as EquipmentFormValues[K])}
          onBlur={(e) => onBlur(key, e.target.value as EquipmentFormValues[K])}
        />
      </div>
    );
  }

  return (
    <>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Type</label>
          <select
            className="admin-select"
            value={form.type}
            onChange={(e) => {
              const v = e.target.value as EquipmentType;
              onChange("type", v);
              onBlur("type", v);
            }}
          >
            {EQUIPMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-label">Name</label>
          <input
            className="admin-input"
            value={form.name}
            placeholder="Macbook Pro 14 M3"
            onChange={(e) => onChange("name", e.target.value)}
            onBlur={(e) => onBlur("name", e.target.value)}
            required
          />
        </div>
      </div>

      <div style={three}>
        {text("brand", "Brand", "Apple")}
        {text("model", "Model", "P1 Gen 6")}
        {text("serial_number", "Serial number")}
      </div>

      {showSpecs && (
        <div className="u-grid-4 u-gap-3">
          {text("processor", "Processor", "M3")}
          {text("ram", "RAM", "16GB")}
          {text("storage", "Storage", "512GB")}
          {text("screen_size", "Screen", "14")}
        </div>
      )}

      <div style={three}>
        <div className="admin-field">
          <label className="admin-label">Purchase date</label>
          <input
            type="date"
            className="admin-input"
            value={form.purchase_date ?? ""}
            onChange={(e) => onChange("purchase_date", e.target.value)}
            onBlur={(e) => onBlur("purchase_date", e.target.value)}
          />
        </div>
        {text("model_year", "Model year", "2024")}
        {text("invoice_ref", "Invoice ref")}
      </div>

      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Vendor</label>
          <select
            className="admin-select"
            value={form.vendor_id ?? ""}
            onChange={(e) => {
              onChange("vendor_id", e.target.value);
              onBlur("vendor_id", e.target.value);
            }}
          >
            <option value="">Not in the directory</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        {text("vendor_name_raw", "Vendor (free text)", "Only if not in the directory")}
      </div>

      <div style={three}>
        {text("cost_vnd", "Cost VND", "43,290,000")}
        {text("cost_usd", "Cost USD", "1,700")}
        <div className="admin-field">
          <label className="admin-label">Condition</label>
          <select
            className="admin-select"
            value={form.condition ?? ""}
            onChange={(e) => {
              onChange("condition", e.target.value);
              onBlur("condition", e.target.value);
            }}
          >
            <option value="">Not recorded</option>
            {EQUIPMENT_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Status</label>
        <select
          className="admin-select"
          value={form.status ?? "in_stock"}
          onChange={(e) => {
            const v = e.target.value as EquipmentStatus;
            onChange("status", v);
            onBlur("status", v);
          }}
        >
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <div className="admin-hint">
          Handing it over or taking it back is done with Assign and Return, not here. Editing status
          only records where the item is, never who has it.
        </div>
      </div>

      <div className="admin-field">
        <label className="admin-label">Photo URL</label>
        <input
          className="admin-input"
          value={form.image_url ?? ""}
          placeholder="Optional. Shows on the employee's My Equipment card."
          onChange={(e) => onChange("image_url", e.target.value)}
          onBlur={(e) => onBlur("image_url", e.target.value)}
        />
      </div>

      <div className="admin-field">
        <label className="admin-label">Notes</label>
        <textarea
          className="admin-input"
          rows={3}
          value={form.notes ?? ""}
          onChange={(e) => onChange("notes", e.target.value)}
          onBlur={(e) => onBlur("notes", e.target.value)}
        />
      </div>
    </>
  );
}

function EquipmentSubmitForm({
  initial,
  vendors,
  submitLabel,
  onSubmit,
}: {
  initial: EquipmentFormValues;
  vendors: VendorOption[];
  submitLabel: string;
  onSubmit: (values: EquipmentFormValues) => Promise<SaveResult>;
}) {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<EquipmentFormValues>(initial);

  function field<K extends keyof EquipmentFormValues>(key: K, value: EquipmentFormValues[K]) {
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
      <EquipmentFields form={form} onChange={field} onBlur={() => {}} vendors={vendors} />
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function EquipmentAutosaveForm({
  initial,
  vendors,
  autosave,
}: {
  initial: EquipmentFormValues;
  vendors: VendorOption[];
  autosave: { onField: (patch: Partial<EquipmentFormValues>) => Promise<SaveResult>; onDone?: () => void };
}) {
  const { form, field, commit, status } = useAutosave(initial, autosave.onField);

  return (
    <div className="admin-form">
      <div className="u-row u-end u-sm">
        <AutosaveIndicator status={status} />
      </div>
      <EquipmentFields form={form} onChange={field} onBlur={commit} vendors={vendors} />
      {status.state === "error" && <div className="admin-alert admin-alert--err">{status.error}</div>}
      <div className="admin-form-actions">
        <button type="button" className="admin-btn" onClick={autosave.onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
