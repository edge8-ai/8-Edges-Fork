// Turning the rows a dashboard card already holds into a CSV (RF-8).
//
// The rule the whole feature rests on: a download is exactly what the card
// shows, for the period on screen. No second query, no report route, no server
// round trip — so the file can never disagree with the picture above it, which
// is the usual way an export goes wrong.
//
// Pure and server-safe on purpose: the serialiser is tested here, and only the
// two lines that touch a Blob live in the client component beside it.

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

// RFC 4180: a field containing a comma, a quote, a newline or a carriage
// return is wrapped in quotes and its own quotes are doubled. A leading
// formula character is prefixed with a tab so a spreadsheet shows the text
// instead of evaluating it — a client name beginning "=" is a name, not a
// formula, and this is how a CSV export becomes an injection otherwise.
//
// The guard runs on TEXT only. A number is never a formula, and defusing one
// would turn every negative figure — a margin, an unmapped cost — into quoted
// text that a spreadsheet refuses to add up, so the column would silently
// total short by exactly the rows that matter most. `-1234` stays `-1234`;
// `-Acme` becomes safe text.
export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `\t${s}`;
  return /[",\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `rows` as CSV text, with a header row taken from the first row's keys — the
 * order the card built them in, which is the order the reader saw. Rows after
 * the first are read through that same key list, so a row with an extra key
 * does not shift a column and a row missing one leaves a blank cell.
 */
export function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const lines = [keys.map(csvCell).join(",")];
  for (const row of rows) lines.push(keys.map((k) => csvCell(row[k])).join(","));
  return lines.join("\r\n");
}

// A filename that survives every filesystem: lowercase, dashes, dated, .csv.
export function csvFilename(base: string, now = new Date()): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "rows"}-${now.toISOString().slice(0, 10)}.csv`;
}
