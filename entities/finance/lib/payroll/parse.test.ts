import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseWorkbook, periodOf } from "./parse";

// The workbook reader, on a register built here: header labels found by name,
// the employee and SERVICE sections, the TOTAL row, an unknown label kept as an
// adjustment, and overtime hours read from the OT sheet by name.

function sheetXml(rows: (string | number | null)[][], strings: string[]): string {
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          if (v === null) return "";
          const ref = `${col(ci)}${ri + 1}`;
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          strings.push(v);
          return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  return `<worksheet><sheetData>${body}</sheetData></worksheet>`;
}

function workbook(sheets: { name: string; rows: (string | number | null)[][] }[]): Uint8Array {
  const strings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows, strings))));
  files["xl/workbook.xml"] = strToU8(`<workbook><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

const HEADER = ["No.", "Full name", "PIT ID", "Contract salary", "Net salary", "Salary via company bank", "UI (1%)", "UI (1%)", "Return PIT"];

describe("parseWorkbook", () => {
  it("reads lines by header label, with sections, totals, adjustments and overtime hours", () => {
    const bytes = workbook([
      {
        name: "Payroll",
        rows: [
          ["EDGE8 PAYROLL", null, null, null, null, null, null, null, null],
          HEADER,
          [null, "OFFICIAL EMPLOYEE", null, null, null, null, null, null, null],
          [1, "Trần Thị Bình", "123", 20000000, 18000000, 18000000, 200000, 100000, 500000],
          [null, "SERVICE", null, null, null, null, null, null, null],
          [2, "An Nguyen", null, 5000000, 4500000, 4500000, 0, 0, 0],
          ["TOTAL", null, null, 25000000, 22500000, 22500000, 200000, 100000, 500000],
        ],
      },
      { name: "OT", rows: [["No.", "Name", "Total (hours)"], [1, "Tran Thi Binh", 6]] },
    ]);
    const run = parseWorkbook(bytes, "3. Payroll Mar 2026.xlsx");
    expect(run.period).toBe("2026-03-01");
    expect(run.lines).toHaveLength(2);
    expect(run.lines[0]).toMatchObject({
      name: "Trần Thị Bình",
      ids: ["123"],
      contract_kind: "employee",
      contract_salary_vnd: 20000000,
      net_salary_vnd: 18000000,
      paid_vnd: 18000000,
      employee_ui_vnd: 200000,
      employer_ui_vnd: 100000,
      overtime_hours: 6,
      adjustments: [{ label: "Return PIT", amount_vnd: 500000 }],
      source_row: 4,
    });
    expect(run.lines[1]).toMatchObject({ name: "An Nguyen", contract_kind: "service", on_probation: false });
    expect(run.totals.net_salary_vnd).toBe(22500000);
    expect(run.unknownLabels).toEqual(["Return PIT"]);
  });

  it("refuses a file that is not a workbook, and a name with no month", () => {
    expect(() => parseWorkbook(new Uint8Array([1, 2, 3]), "x.xlsx")).toThrow(/not an Excel workbook/);
    expect(() => periodOf("payroll.xlsx")).toThrow(/Cannot read the month/);
  });
});
