"use client";

import { humanize } from "@/kernel/ui/format";
import { VENDOR_RATINGS, VENDOR_TYPES, type VendorInput, type VendorType } from "./vendor-shared";

// The vendor field set VendorForm renders. `hideFinancial` leaves out Tax ID and
// Bank info, which are admin-only; the team surface's form passes it.
export function VendorFields({
  form,
  onChange,
  onBlur,
  hideFinancial,
}: {
  form: VendorInput;
  onChange: <K extends keyof VendorInput>(key: K, value: VendorInput[K]) => void;
  onBlur: <K extends keyof VendorInput>(key: K, value: VendorInput[K]) => void;
  hideFinancial?: boolean;
}) {
  const two = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } as const;
  return (
    <>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Type</label>
          <select
            className="admin-select"
            value={form.type}
            onChange={(e) => {
              const v = e.target.value as VendorType;
              onChange("type", v);
              onBlur("type", v);
            }}
          >
            {VENDOR_TYPES.map((t) => (
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
            onChange={(e) => onChange("name", e.target.value)}
            onBlur={(e) => onBlur("name", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Price range</label>
        <input
          className="admin-input"
          value={form.price_range}
          onChange={(e) => onChange("price_range", e.target.value)}
          onBlur={(e) => onBlur("price_range", e.target.value)}
          placeholder="e.g. 1,900,000 VND/day"
        />
      </div>
      <div className="admin-field">
        <label className="admin-label">Address</label>
        <input
          className="admin-input"
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          onBlur={(e) => onBlur("address", e.target.value)}
        />
      </div>
      <div style={two}>
        <div className="admin-field">
          <label className="admin-label">Phone</label>
          <input
            className="admin-input"
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            onBlur={(e) => onBlur("phone", e.target.value)}
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">URL</label>
          <input
            className="admin-input"
            value={form.url}
            onChange={(e) => onChange("url", e.target.value)}
            onBlur={(e) => onBlur("url", e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
      <div style={two}>
        {!hideFinancial && (
          <div className="admin-field">
            <label className="admin-label">Tax ID</label>
            <input
              className="admin-input"
              value={form.tax_id}
              onChange={(e) => onChange("tax_id", e.target.value)}
              onBlur={(e) => onBlur("tax_id", e.target.value)}
            />
          </div>
        )}
        <div className="admin-field">
          <label className="admin-label">Rating</label>
          <select
            className="admin-select"
            value={form.rating}
            onChange={(e) => {
              onChange("rating", e.target.value);
              onBlur("rating", e.target.value);
            }}
          >
            <option value="">—</option>
            {VENDOR_RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!hideFinancial && (
        <div className="admin-field">
          <label className="admin-label">Bank info</label>
          <input
            className="admin-input"
            value={form.bank_info}
            onChange={(e) => onChange("bank_info", e.target.value)}
            onBlur={(e) => onBlur("bank_info", e.target.value)}
          />
        </div>
      )}
      <div className="admin-field">
        <label className="admin-label">Primary contact</label>
        <div className="u-grid-auto-sm">
          <input
            className="admin-input"
            value={form.primary_contact_name}
            onChange={(e) => onChange("primary_contact_name", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_name", e.target.value)}
            placeholder="Name"
          />
          <input
            className="admin-input"
            type="email"
            value={form.primary_contact_email}
            onChange={(e) => onChange("primary_contact_email", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_email", e.target.value)}
            placeholder="Email"
          />
          <input
            className="admin-input"
            value={form.primary_contact_phone}
            onChange={(e) => onChange("primary_contact_phone", e.target.value)}
            onBlur={(e) => onBlur("primary_contact_phone", e.target.value)}
            placeholder="Phone"
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Secondary contact</label>
        <div className="u-grid-auto-sm">
          <input
            className="admin-input"
            value={form.secondary_contact_name}
            onChange={(e) => onChange("secondary_contact_name", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_name", e.target.value)}
            placeholder="Name"
          />
          <input
            className="admin-input"
            type="email"
            value={form.secondary_contact_email}
            onChange={(e) => onChange("secondary_contact_email", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_email", e.target.value)}
            placeholder="Email"
          />
          <input
            className="admin-input"
            value={form.secondary_contact_phone}
            onChange={(e) => onChange("secondary_contact_phone", e.target.value)}
            onBlur={(e) => onBlur("secondary_contact_phone", e.target.value)}
            placeholder="Phone"
          />
        </div>
      </div>
      <div className="admin-field">
        <label className="admin-label">Notes</label>
        <textarea
          className="admin-textarea"
          rows={4}
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
          onBlur={(e) => onBlur("notes", e.target.value)}
        />
      </div>
    </>
  );
}
