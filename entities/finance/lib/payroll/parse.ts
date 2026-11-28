// Reads one of the accountant's monthly payroll workbooks into lines for
// company_os.payroll_lines_sensitive (O.1.4). A port of the reading half of
// scripts/payroll/import_payroll.py, so an upload in the app and the bulk
// import read a workbook the same way:
// - The layout changed between 2024 and 2026, so columns are found by their
//   English header label, never by position. A label the map does not know is
//   kept, with its amount, in `adjustments`.
// - From March 2025 the register is split into an employee section and a
//   SERVICE (service contract) section, each headed by a label row.
// - Leave days come from the Timesheet sheet and overtime hours from the OT
//   sheet, matched by name.
import { readWorkbook, type Cell } from "./xlsx";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Header label -> line column. Labels that appear twice (UI (1%)) are resolved
// by order: the first is the employee's share, the second the employer's.
export const COLUMNS: Record<string, string> = {
  "Contract salary": "contract_salary_vnd",
  "Days working": "days_worked",
  "Days/ Hours working": "days_worked",
  "Actual gross salary": "gross_salary_vnd",
  "Lunch allowance (free PIT)": "lunch_allowance_vnd",
  "Internet allowance": "internet_allowance_vnd",
  "Telephone allowance": "phone_allowance_vnd",
  "Other allowance": "other_allowance_vnd",
  Bonus: "bonus_vnd",
  "Over time": "overtime_vnd",
  "OT with free PIT": "overtime_vnd",
  "Over time (free PIT)": "overtime_vnd",
  "Actual income in month": "total_income_vnd",
  "Basic salary for insurance": "insurance_base_vnd",
  "SI (8%)": "employee_si_vnd",
  "HI (1.5%)": "employee_hi_vnd",
  "Self-deduction": "self_deduction_vnd",
  "Family deductions": "family_deduction_vnd",
  "Taxable income": "taxable_income_vnd",
  PIT: "pit_vnd",
  "Net salary": "net_salary_vnd",
  "Net salary (13th salary included)": "net_salary_vnd",
  "SI (17.5%)": "employer_si_vnd",
  "HI (3%)": "employer_hi_vnd",
  "Other receivable": "other_receivable_vnd",
  "Other receivables": "other_receivable_vnd",
  "Other payable": "other_payable_vnd",
  "Other payables": "other_payable_vnd",
  "Salary via company bank": "paid_vnd",
  "No. of dependent": "dependents",
};
// Columns that several labels add into, rather than the last one winning.
const SUMMED = new Set(["overtime_vnd"]);
// Labels that carry no figure of their own: identity, rates derived from the
// contract salary, and totals derived from the line.
const IGNORED = new Set([
  "No.", "Full name", "PIT ID", "ID card no. /Passport", "ID no. /Passport", "Position",
  "Probation / Service", "On probation", "Daily salary", "Hourly salary", "No. of days in month",
  "Total SI, HI, UI from employee", "Total SI, HI, UI from company", "Total deduction)",
  "Description", "Banking Account", "Bank", "UI (1%)",
]);
// Mid-2024 workbooks tracked the transfer in these instead of "Salary via company bank".
const PAID_FALLBACKS = ["Paid", "Have to pay"];
// Every line column the importer writes, and those the table defaults to 0.
export const ZERO_DEFAULT = new Set([
  "lunch_allowance_vnd", "internet_allowance_vnd", "phone_allowance_vnd", "other_allowance_vnd", "bonus_vnd",
  "overtime_vnd", "overtime_hours", "employee_si_vnd", "employee_hi_vnd", "employee_ui_vnd",
  "self_deduction_vnd", "family_deduction_vnd", "pit_vnd", "employer_si_vnd", "employer_hi_vnd",
  "employer_ui_vnd", "other_receivable_vnd", "other_payable_vnd", "unpaid_leave_days", "annual_leave_days",
  "dependents",
]);
export const LINE_KEYS = [
  ...new Set([
    ...Object.values(COLUMNS),
    "employee_ui_vnd", "employer_ui_vnd", "on_probation", "contract_kind", "unpaid_leave_days",
    "annual_leave_days", "overtime_hours", "adjustments", "source_row",
  ]),
].sort();

export type Adjustment = { label: string; amount_vnd: number };
export type ParsedLine = Record<string, unknown> & {
  source_row: number;
  adjustments: Adjustment[];
  contract_kind: "employee" | "service";
  on_probation: boolean;
  name: string;
  position: string | null;
  ids: string[];
  bank: string | null;
};
export type ParsedRun = {
  period: string; // YYYY-MM-01
  isEstimate: boolean;
  workingDays: number | null;
  sourceFile: string;
  lines: ParsedLine[];
  totals: Record<string, number>;
  unknownLabels: string[];
};

/** A name folded for matching: lower case, no diacritics, đ as d, single spaces. */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[^\x00-\x7f]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function label(v: Cell): string {
  return v === null || v === undefined ? "" : String(v).split(/\s+/).filter(Boolean).join(" ");
}

function num(v: Cell): number | null {
  if (v === null || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function whole(v: Cell): number | null {
  const n = num(v);
  // Python's round() rounds halves to even; the register's figures are whole
  // VND already, so a half never occurs in practice.
  return n === null ? null : Math.round(n);
}

const isNumber = (v: Cell): v is number => typeof v === "number";
const isText = (v: Cell): v is string => typeof v === "string";

/** The month a workbook covers, from its file name ("9. Payroll Sep 2026.xlsx"). */
export function periodOf(fileName: string): string {
  const m = fileName.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i);
  if (!m) throw new Error(`Cannot read the month from the file name "${fileName}". Name it like "9. Payroll Sep 2026.xlsx".`);
  return `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-01`;
}

/** Per-person values from the Timesheet or OT sheet, keyed by folded name. */
function sideSheet(rows: Cell[][] | undefined, nameCol: number, wanted: Record<string, string>): Map<string, Record<string, number | null>> {
  const out = new Map<string, Record<string, number | null>>();
  if (!rows) return out;
  const cols: Record<string, number> = {};
  for (const r of rows.slice(0, 8)) r.forEach((v, i) => { if (isText(v) && wanted[label(v)]) cols[wanted[label(v)]] = i; });
  for (const r of rows) {
    if (r.length > nameCol && isNumber(r[0]) && isText(r[nameCol])) {
      const values: Record<string, number | null> = {};
      for (const [k, i] of Object.entries(cols)) if (i < r.length) values[k] = num(r[i]);
      out.set(norm(r[nameCol] as string), values);
    }
  }
  return out;
}

export function parseWorkbook(bytes: Uint8Array, fileName: string): ParsedRun {
  const sheets = readWorkbook(bytes);
  const ws = sheets[0];
  if (!ws) throw new Error("The workbook has no sheets.");
  const rows = ws.rows;
  const hi = rows.findIndex((r) => r.some((v) => label(v) === "Full name"));
  if (hi < 0) throw new Error(`The first sheet ("${ws.name}") has no "Full name" header row.`);
  const hdr = rows[hi].map(label);
  const ix = new Map<string, number>();
  hdr.forEach((h, i) => { if (!ix.has(h)) ix.set(h, i); }); // first occurrence wins
  const ui = hdr.flatMap((h, i) => (h === "UI (1%)" ? [i] : []));
  const prob = ix.get("Probation / Service") ?? ix.get("On probation");

  const byName = new Map(sheets.map((s) => [s.name, s.rows]));
  const leave = sideSheet(byName.get("Timesheet"), 1, { "Unpaid leave (KL)": "unpaid_leave_days", "Annual leave (NP)": "annual_leave_days" });
  const ot = sideSheet(byName.get("OT"), 1, { "Total (hours)": "overtime_hours" });

  const lines: ParsedLine[] = [];
  const unknown = new Set<string>();
  let totalRow: Cell[] | null = null;
  let section: string | null = null;
  rows.slice(hi + 1).forEach((r, k) => {
    const n = hi + 2 + k; // the row's number in the sheet
    if (r[0] === null && isText(r[1]) && r[1].trim()) {
      section = label(r[1]).toUpperCase();
      return;
    }
    if (isText(r[0]) && label(r[0]).toUpperCase() === "TOTAL") {
      totalRow = r;
      return;
    }
    if (!(isNumber(r[0]) && isText(r[1]) && r[1].trim())) return;

    const line: Record<string, unknown> = { source_row: n, adjustments: [] as Adjustment[] };
    hdr.forEach((h, i) => {
      if (!h || IGNORED.has(h) || i >= r.length) return;
      const col = COLUMNS[h];
      if (col === "days_worked") line[col] = num(r[i]);
      else if (col === "dependents") line[col] = whole(r[i]) || 0;
      else if (col && SUMMED.has(col)) line[col] = ((line[col] as number | undefined) ?? 0) + (whole(r[i]) ?? 0);
      else if (col === "taxable_income_vnd" && col in line) return; // a second "Taxable income" is a subtotal of the first
      else if (col) line[col] = whole(r[i]);
      else if (PAID_FALLBACKS.includes(h)) return;
      else {
        const amount = whole(r[i]);
        if (amount) {
          (line.adjustments as Adjustment[]).push({ label: h, amount_vnd: amount });
          unknown.add(h);
        }
      }
    });
    if (ui.length >= 1) line.employee_ui_vnd = whole(r[ui[0]]);
    if (ui.length >= 2) line.employer_ui_vnd = whole(r[ui[1]]);
    if (line.paid_vnd === null || line.paid_vnd === undefined) {
      for (const h of PAID_FALLBACKS) {
        const i = ix.get(h);
        if (i !== undefined && whole(r[i]) !== null) {
          line.paid_vnd = whole(r[i]);
          break;
        }
      }
    }
    // The "Probation / Service" flag marks probation inside the employee
    // section and nothing new inside SERVICE. Before Mar 2025 there are no
    // sections, so the flag cannot tell the two apart; it is read as probation.
    line.contract_kind = section === "SERVICE" ? "service" : "employee";
    line.on_probation = Boolean(prob !== undefined && r[prob]) && section !== "SERVICE";
    const name = (r[1] as string).trim();
    const side = { ...(leave.get(norm(name)) ?? {}), ...(ot.get(norm(name)) ?? {}) };
    for (const key of ["unpaid_leave_days", "annual_leave_days", "overtime_hours"]) line[key] = side[key] || 0;
    const at = (h: string) => (ix.has(h) ? r[ix.get(h) as number] : null);
    line.name = name;
    line.position = ix.has("Position") ? label(at("Position")) || null : null;
    line.ids = [...new Set(["PIT ID", "ID card no. /Passport", "ID no. /Passport"].map((h) => (at(h) ? label(at(h)) : "")).filter(Boolean))];
    line.bank = at("Banking Account") ? label(at("Banking Account")) : null;
    lines.push(line as ParsedLine);
  });

  // The working days in the month: the value most rows agree on.
  const days = new Map<number, number>();
  const dayCol = ix.get("No. of days in month");
  if (dayCol !== undefined) {
    for (const r of rows.slice(hi + 1)) {
      const d = num(r[dayCol]);
      if (isNumber(r[0]) && d) days.set(d, (days.get(d) ?? 0) + 1);
    }
  }
  const workingDays = [...days.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const totals: Record<string, number> = {};
  const total = totalRow as Cell[] | null;
  if (total) {
    for (const [h, col] of Object.entries(COLUMNS)) {
      const i = ix.get(h);
      if (i === undefined || col === "days_worked" || col === "dependents" || i >= total.length) continue;
      const v = whole(total[i]);
      if (v === null) continue;
      totals[col] = SUMMED.has(col) ? (totals[col] ?? 0) + v : v;
    }
  }

  return {
    period: periodOf(fileName),
    isEstimate: ws.name.toLowerCase().includes("estimat"),
    workingDays,
    sourceFile: fileName,
    lines,
    totals,
    unknownLabels: [...unknown].sort(),
  };
}
