// Section 1 of the Profile board (RP.6; stories 2-5): which column of the
// export holds each of the four values, found by heading, and the row count at
// or below which the export is flagged as possibly cut off.
import type { Profile } from "@/entities/replenishment/client";
import { numberText } from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, ParsedInput, type Part } from "./editor-fields";

type Columns = Profile["columns"];

const COLUMNS: [keyof Columns, string][] = [
  ["item", "Item code column"],
  ["description", "Description column"],
  ["location", "Location column"],
  ["qty", "Quantity column"],
];

/** Blank means "no warning", which the schema stores as null. */
const threshold = (text: string): number | null => (text.trim() === "" ? null : Number(text));

export function ExportSection({ value, onChange, issues }: Part<Pick<Profile, "columns" | "truncatedAtOrBelow">>) {
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">1. Your export</h2>
      <p className="admin-cell-muted">Columns are found by their heading, never by position. Any other column is ignored.</p>
      <div className="u-grid-2">
        {COLUMNS.map(([key, label]) => (
          <label key={key} className="admin-field">
            <span className="admin-label">{label}</span>
            <input
              className="admin-input"
              value={value.columns[key]}
              onChange={(e) => onChange({ ...value, columns: { ...value.columns, [key]: e.target.value } })}
            />
            <FieldIssue issues={issues} path={`columns.${key}`} />
          </label>
        ))}
      </div>
      <label className="rp-profile-sentence u-mt-4">
        Warn the operator when the export has
        <ParsedInput
          className="admin-input rp-profile-num"
          type="number"
          min={1}
          inputMode="numeric"
          value={value.truncatedAtOrBelow}
          format={numberText}
          parse={threshold}
          onValue={(truncatedAtOrBelow) => onChange({ ...value, truncatedAtOrBelow })}
        />
        rows or fewer (the export may be cut off). Leave it blank for no warning.
      </label>
      <FieldIssue issues={issues} path="truncatedAtOrBelow" />
    </section>
  );
}
