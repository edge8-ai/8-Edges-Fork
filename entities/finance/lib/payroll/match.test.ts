import { describe, expect, it } from "vitest";
import { matchRun, type PayrollPerson } from "./match";
import type { ParsedLine, ParsedRun } from "./parse";

// Each register line is matched to the team member it paid: by ID first, by
// name second, by employment dates when a person has two spells, and never
// silently when a line is unmatched, ambiguous or twice in one month.

const line = (name: string, ids: string[] = [], kind: "employee" | "service" = "employee", extra: Record<string, unknown> = {}): ParsedLine => ({
  source_row: 5,
  adjustments: [],
  contract_kind: kind,
  on_probation: false,
  name,
  position: null,
  ids,
  bank: null,
  ...extra,
});
const run = (lines: ParsedLine[], totals: Record<string, number> = {}): ParsedRun => ({
  period: "2026-03-01",
  isEstimate: false,
  workingDays: 22,
  sourceFile: "3. Payroll Mar 2026.xlsx",
  lines,
  totals,
  unknownLabels: [],
});
const person = (teamMemberId: string, name: string, ids: string[] = [], dates: [string | null, string | null] = [null, null]): PayrollPerson => ({
  teamMemberId,
  label: name,
  names: [name],
  ids,
  startDate: dates[0],
  endDate: dates[1],
});

describe("matchRun", () => {
  it("matches by ID before name, and by name with or without diacritics or in either order", () => {
    const people = [person("tm-a", "Nguyễn Văn An", ["123"]), person("tm-b", "Trần Thị Bình")];
    const out = matchRun(run([line("Somebody Else", ["123"]), line("Binh Tran Thi")]), people);
    expect(out.problems).toEqual([]);
    expect(out.lines.map((l) => [l.team_member_id, l.how])).toEqual([
      ["tm-a", "ID"],
      ["tm-b", "name"],
    ]);
  });

  it("lets the name decide when the workbook's ID belongs to someone with a different name", () => {
    const people = [person("tm-a", "An Nguyen", ["123"]), person("tm-b", "Binh Tran")];
    const out = matchRun(run([line("Binh Tran", ["123"])]), people);
    expect(out.lines[0].team_member_id).toBe("tm-b");
    expect(out.notes[0]).toMatch(/belongs to someone else/);
  });

  it("picks the employment spell of that month for someone who left and came back", () => {
    const people = [person("tm-old", "An Nguyen", [], ["2024-01-01", "2024-12-31"]), person("tm-new", "An Nguyen", [], ["2026-01-01", null])];
    expect(matchRun(run([line("An Nguyen")]), people).lines[0].team_member_id).toBe("tm-new");
  });

  it("refuses an unmatched name, an ambiguous one and a person twice in one section", () => {
    const people = [person("tm-1", "An Nguyen"), person("tm-2", "An Nguyen"), person("tm-3", "Binh Tran")];
    const out = matchRun(run([line("Nobody Known"), line("An Nguyen"), line("Binh Tran"), line("Binh Tran")]), people);
    expect(out.problems).toEqual([
      { name: "Nobody Known", sourceRow: 5, why: "unmatched" },
      { name: "An Nguyen", sourceRow: 5, why: "ambiguous" },
      { name: "Binh Tran", sourceRow: 5, why: "twice in one month" },
    ]);
  });

  it("takes a person's pick for a row the rules could not match", () => {
    const out = matchRun(run([line("Ngo Phat Tai", [], "employee", { source_row: 9 })]), [person("tm-t", "Tai Ngo")], { 9: "tm-t" });
    expect(out.problems).toEqual([]);
    expect(out.lines[0]).toMatchObject({ team_member_id: "tm-t", how: "a person's pick" });
  });

  it("allows one person in both the employee and the service section", () => {
    const out = matchRun(run([line("Binh Tran"), line("Binh Tran", [], "service")]), [person("tm-3", "Binh Tran")]);
    expect(out.problems).toEqual([]);
    expect(out.lines).toHaveLength(2);
  });

  it("notes when the lines do not add up to the TOTAL row", () => {
    const out = matchRun(run([line("Binh Tran", [], "employee", { net_salary_vnd: 1000 })], { net_salary_vnd: 5000 }), [person("tm-3", "Binh Tran")]);
    expect(out.notes).toEqual(["The lines do not add up to the TOTAL row for net salary."]);
  });
});
