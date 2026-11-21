// One item rule on the Profile board (RP.6; stories 13-21): its name, on or
// off, what it applies to and requires, how it reads a size, and its bands,
// each with a restock threshold and a set amount or a choice the operator
// makes at the shelf. "Jobs" is how many the band makes of the last export.
import type { Profile } from "@/entities/replenishment/client";
import {
  blankBand,
  numberText,
  optionalNumber,
  optionalText,
  optionsFrom,
  removeAt,
  replaceAt,
  requiredNumber,
  withMoveKind,
} from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, ParsedInput, type Part } from "./editor-fields";
import { TestsEditor } from "./TestsEditor";

type Rule = Profile["rules"][number];
type Band = Rule["bands"][number];

type Props = Part<Rule> & {
  index: number;
  count: number;
  words: Profile["words"];
  /** Jobs per band of the last export, or null when there is no preview to count from. */
  bandJobs: number[] | null;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
};

export function RuleCard({ value: rule, onChange, issues, index, count, words, bandJobs, onMove, onRemove }: Props) {
  const at = `rules.${index}`;
  const setBand = (j: number, band: Band) => onChange({ ...rule, bands: replaceAt(rule.bands, j, band) });
  const jobs = bandJobs && rule.enabled ? bandJobs.reduce((sum, n) => sum + n, 0) : null;

  return (
    <div className={rule.enabled ? "rp-profile-rule" : "rp-profile-rule is-off"}>
      <div className="admin-form-row">
        <label className="admin-field admin-field--wide">
          <span className="admin-label">Rule</span>
          <input className="admin-input admin-cell-strong" value={rule.label} onChange={(e) => onChange({ ...rule, label: e.target.value })} placeholder="A product line" />
          <FieldIssue issues={issues} path={`${at}.label`} />
        </label>
        <span className="admin-hint u-self-end">{jobs === null ? "" : `${jobs} ${jobs === 1 ? "job" : "jobs"} in the last export`}</span>
        <button type="button" className="admin-btn admin-btn--sm" aria-pressed={rule.enabled} onClick={() => onChange({ ...rule, enabled: !rule.enabled })}>
          {rule.enabled ? "On" : "Off: a draft, not applied"}
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${rule.label || "this rule"} up`}>
          Up
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${rule.label || "this rule"} down`}>
          Down
        </button>
        <button type="button" className="admin-btn admin-btn--sm" disabled={count === 1} onClick={onRemove}>
          Remove
        </button>
      </div>

      <TestsEditor title="Applies when" addLabel="Add a test" path={`${at}.when`} value={rule.when} issues={issues} onChange={(when) => onChange({ ...rule, when })} />
      <TestsEditor
        title="Must also carry, or the item is left out"
        addLabel="Add a requirement"
        path={`${at}.require`}
        value={rule.require ?? []}
        issues={issues}
        onChange={(require) => onChange({ ...rule, require: require.length > 0 ? require : undefined })}
      />
      <label className="admin-field u-mt-1">
        <span className="admin-label">Size, read from the description by a pattern with a group named size (blank: no sizes)</span>
        <input className="admin-input admin-cell-mono" value={rule.size ?? ""} onChange={(e) => onChange({ ...rule, size: optionalText(e.target.value) })} />
        <FieldIssue issues={issues} path={`${at}.size`} />
      </label>

      <div className="admin-table-scroll u-mt-1">
        <table className="admin-table rp-profile-bands">
          <thead>
            <tr>
              <th>Band</th>
              <th>Sizes from</th>
              <th>to</th>
              <th>Restock when {words.pick} is below</th>
              <th>Move</th>
              <th>Quantity</th>
              <th className="u-right">Jobs</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rule.bands.map((band, j) => (
              <tr key={j}>
                <td>
                  <input className="admin-input" aria-label="Band name" value={band.label} onChange={(e) => setBand(j, { ...band, label: e.target.value })} />
                  <FieldIssue issues={issues} path={`${at}.bands.${j}.label`} />
                </td>
                {(["min", "max"] as const).map((end) => (
                  <td key={end}>
                    <ParsedInput
                      className="admin-input rp-profile-num"
                      type="number"
                      aria-label={end === "min" ? "Smallest size" : "Largest size"}
                      value={band[end]}
                      format={numberText}
                      parse={optionalNumber}
                      onValue={(n) => setBand(j, { ...band, [end]: n })}
                    />
                    <FieldIssue issues={issues} path={`${at}.bands.${j}.${end}`} />
                  </td>
                ))}
                <td>
                  <ParsedInput
                    className="admin-input rp-profile-num"
                    type="number"
                    min={0}
                    aria-label="Restock threshold"
                    value={band.reorderBelow}
                    format={numberText}
                    parse={requiredNumber}
                    onValue={(reorderBelow) => setBand(j, { ...band, reorderBelow })}
                  />
                  <FieldIssue issues={issues} path={`${at}.bands.${j}.reorderBelow`} />
                </td>
                <td>
                  <select
                    className="admin-select"
                    aria-label="Move kind"
                    value={band.move.kind}
                    onChange={(e) => setBand(j, { ...band, move: withMoveKind(band.move, e.target.value === "choice" ? "choice" : "fixed") })}
                  >
                    <option value="fixed">A set amount</option>
                    <option value="choice">Operator chooses</option>
                  </select>
                </td>
                <td>
                  {band.move.kind === "fixed" ? (
                    <ParsedInput
                      className="admin-input rp-profile-num"
                      type="number"
                      min={0}
                      aria-label="Quantity"
                      value={band.move.qty}
                      format={numberText}
                      parse={requiredNumber}
                      onValue={(qty) => setBand(j, { ...band, move: { kind: "fixed", qty } })}
                    />
                  ) : (
                    <ParsedInput
                      className="admin-input rp-profile-num"
                      aria-label="Quantities to choose from"
                      placeholder="8, 12"
                      value={band.move.options}
                      format={(options) => options.map(numberText).join(", ")}
                      parse={optionsFrom}
                      onValue={(options) => setBand(j, { ...band, move: { kind: "choice", options } })}
                    />
                  )}
                  <FieldIssue issues={issues} path={`${at}.bands.${j}.move`} />
                </td>
                <td className="u-right u-tabular admin-cell-strong">{bandJobs && rule.enabled ? (bandJobs[j] ?? 0) : "–"}</td>
                <td>
                  <button type="button" className="admin-btn admin-btn--sm" disabled={rule.bands.length === 1} onClick={() => onChange({ ...rule, bands: removeAt(rule.bands, j) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="admin-btn admin-btn--sm u-mt-1" onClick={() => onChange({ ...rule, bands: [...rule.bands, blankBand()] })}>
        Add a band
      </button>
    </div>
  );
}
