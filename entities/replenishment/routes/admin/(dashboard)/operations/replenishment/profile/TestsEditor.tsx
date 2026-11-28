// A list of text tests on an item (RP.6; stories 12-14): what is always left
// out, what a rule applies to, and what an item must also carry. Each test has
// a name (what a left-out item's reason reads), the field it reads, and words
// to contain or a pattern to match; given both, both must hold.
import type { Profile } from "@/entities/replenishment/client";
import { blankTest, optionalText, removeAt, replaceAt } from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, type Part } from "./editor-fields";

type ItemTest = Profile["exclude"][number];

type Props = Part<ItemTest[]> & {
  /** The draft path of the list, such as "rules.0.when", so each refusal lands beside its test. */
  path: string;
  title: string;
  addLabel: string;
};

export function TestsEditor({ value: tests, onChange, issues, path, title, addLabel }: Props) {
  const set = (i: number, test: ItemTest) => onChange(replaceAt(tests, i, test));
  return (
    <fieldset className="rp-profile-tests">
      <legend className="admin-label">{title}</legend>
      <FieldIssue issues={issues} path={path} exact />
      {tests.length === 0 && <p className="admin-hint u-m-0">None.</p>}
      {tests.map((test, i) => (
        <div key={i} className="admin-form-row rp-profile-test">
          <label className="admin-field">
            <span className="admin-label">Name</span>
            <input className="admin-input" value={test.label} onChange={(e) => set(i, { ...test, label: e.target.value })} placeholder="Socks" />
          </label>
          <label className="admin-field">
            <span className="admin-label">Reads</span>
            <select
              className="admin-select"
              value={test.field ?? "description"}
              onChange={(e) => set(i, { ...test, field: e.target.value === "item" ? "item" : undefined })}
            >
              <option value="description">the description</option>
              <option value="item">the item code</option>
            </select>
          </label>
          <label className="admin-field">
            <span className="admin-label">Contains</span>
            <input className="admin-input" value={test.contains ?? ""} onChange={(e) => set(i, { ...test, contains: optionalText(e.target.value) })} />
          </label>
          <label className="admin-field admin-field--wide">
            <span className="admin-label">Matches the pattern</span>
            <input className="admin-input admin-cell-mono" value={test.regex ?? ""} onChange={(e) => set(i, { ...test, regex: optionalText(e.target.value) })} />
          </label>
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => onChange(removeAt(tests, i))}>
            Remove
          </button>
          <div className="u-w-full">
            <FieldIssue issues={issues} path={`${path}.${i}`} />
          </div>
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--sm u-self-start" onClick={() => onChange([...tests, blankTest()])}>
        {addLabel}
      </button>
    </fieldset>
  );
}
