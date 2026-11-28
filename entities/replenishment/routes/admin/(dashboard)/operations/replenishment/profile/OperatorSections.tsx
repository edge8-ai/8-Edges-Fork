// Sections 4 and 5 of the Profile board (RP.6; stories 25-27): how many pick
// BINs to suggest and from which end of the walk, and the words the scanner
// shows, in the warehouse's own terms.
import type { Profile } from "@/entities/replenishment/client";
import { linesFrom } from "@/entities/replenishment/ui/profile-draft";
import { FieldIssue, ParsedTextarea, type Part } from "./editor-fields";

type Destinations = Profile["destinations"];
type Words = Profile["words"];

const COUNTS = Array.from({ length: 10 }, (_, i) => i + 1);

export function DestinationsSection({ value, onChange, issues, words }: Part<Destinations> & { words: Words }) {
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">4. Where the stock goes</h2>
      <p className="admin-cell-muted">Suggested BINs are the {words.pick} BINs already holding the item. The operator can scan any BIN.</p>
      <div className="rp-profile-sentence">
        Suggest
        <select className="admin-select" aria-label="How many BINs" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) })}>
          {COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {value.count === 1 ? "BIN," : "BINs,"}
        <select
          className="admin-select"
          aria-label="Which first"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value === "nearest" ? "nearest" : "furthest" })}
        >
          <option value="furthest">furthest along the walk first</option>
          <option value="nearest">nearest first</option>
        </select>
      </div>
      <FieldIssue issues={issues} path="destinations" />
    </section>
  );
}

/** The words held as one required line each. */
type LineKey = "pick" | "reserve" | "destinationRule" | "noPickNote" | "choiceHint";

const ONE_LINE: [LineKey, string][] = [
  ["destinationRule", "Where to put it"],
  ["noPickNote", "When an item has no pick BIN"],
  ["choiceHint", "When the operator chooses the amount"],
];

export function WordsSection({ value: words, onChange, issues }: Part<Words>) {
  const text = (key: LineKey, label: string) => (
    <label key={key} className="admin-field">
      <span className="admin-label">{label}</span>
      <input className="admin-input" value={words[key]} onChange={(e) => onChange({ ...words, [key]: e.target.value })} />
      <FieldIssue issues={issues} path={`words.${key}`} />
    </label>
  );
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">5. The operator&apos;s screen</h2>
      <p className="admin-cell-muted">The words the scanner shows, in this warehouse&apos;s own terms.</p>
      <div className="u-grid-2">
        {text("pick", "Name for pick BINs")}
        {text("reserve", "Name for reserve BINs")}
      </div>
      <label className="admin-field u-mt-4">
        <span className="admin-label">Instructions, one per line</span>
        <ParsedTextarea<string[]>
          className="admin-textarea u-resize-y"
          rows={5}
          value={words.instructions}
          format={(lines) => lines.join("\n")}
          parse={linesFrom}
          onValue={(instructions) => onChange({ ...words, instructions })}
        />
        <FieldIssue issues={issues} path="words.instructions" />
      </label>
      <div className="u-grid-2 u-mt-4">
        {ONE_LINE.map(([key, label]) => text(key, label))}
        <label className="admin-field">
          <span className="admin-label">Footer line (optional)</span>
          <input className="admin-input" value={words.footer ?? ""} onChange={(e) => onChange({ ...words, footer: e.target.value === "" ? null : e.target.value })} />
          <FieldIssue issues={issues} path="words.footer" />
        </label>
      </div>
    </section>
  );
}
