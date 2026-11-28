// Matches each line of a payroll workbook to the team member it paid. The
// matching half of scripts/payroll/import_payroll.py, as a pure function: the
// caller reads the people, this decides.
// - Tax code or national ID first, because names are typed with and without
//   diacritics and in both name orders; the name is the fallback.
// - A workbook ID that belongs to someone with a different name is a row copied
//   from a colleague (Mar and Apr 2026): the name decides.
// - A person who left and came back has one employment row per spell; the one
//   employed that month wins.
// Nothing may be written while any line is unmatched, ambiguous or twice in
// one month: a wrong match would show one person's pay as another's.
import { norm, type ParsedLine, type ParsedRun } from "./parse";

export type PayrollPerson = {
  teamMemberId: string;
  // How the person is named on screen (personName), for the preview.
  label: string;
  // Every name they go by (full name, display name), each tried for a match.
  names: string[];
  ids: string[]; // tax code, national ID number
  startDate: string | null;
  endDate: string | null;
};

export type MatchedLine = ParsedLine & { team_member_id: string; matchedName: string; how: string };
export type Problem = { name: string; sourceRow: number; why: "unmatched" | "ambiguous" | "twice in one month" };
export type MatchResult = { lines: MatchedLine[]; problems: Problem[]; notes: string[] };

function employedOn(p: PayrollPerson, period: string): boolean {
  const start = p.startDate ?? "0000-01-01";
  const end = p.endDate ?? "9999-12-31";
  return start <= `${period.slice(0, 8)}28` && end >= period;
}

/**
 * `picked` holds the team member a person chose for a register row (by its
 * row number) when the workbook's name and ID matched nobody, or more than
 * one: the person's choice wins over the rules, and says so.
 */
export function matchRun(run: ParsedRun, people: PayrollPerson[], picked: Record<number, string> = {}): MatchResult {
  const byId = new Map<string, Set<string>>();
  const exact = new Map<string, Set<string>>();
  const reordered = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, k: string, v: string) => m.set(k, (m.get(k) ?? new Set()).add(v));
  const byTm = new Map(people.map((p) => [p.teamMemberId, p]));
  for (const p of people) {
    for (const id of p.ids) if (id.trim()) add(byId, id.trim(), p.teamMemberId);
    for (const n of p.names) {
      const w = norm(n).split(" ").filter(Boolean);
      if (w.length === 0) continue;
      add(exact, w.join(" "), p.teamMemberId);
      // Given-Family <-> Family-Given, consulted only when no name matches
      // exactly: Vu Tran Minh and Tran Minh Vu are two different people.
      add(reordered, [...w.slice(1), ...w.slice(0, 1)].join(" "), p.teamMemberId);
      add(reordered, [...w.slice(-1), ...w.slice(0, -1)].join(" "), p.teamMemberId);
    }
  }

  const lines: MatchedLine[] = [];
  const problems: Problem[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  for (const line of run.lines) {
    const choice = picked[line.source_row];
    if (choice && byTm.has(choice)) {
      const key = `${choice}:${line.contract_kind}`;
      if (seen.has(key)) {
        problems.push({ name: line.name, sourceRow: line.source_row, why: "twice in one month" });
        continue;
      }
      seen.add(key);
      lines.push({ ...line, team_member_id: choice, matchedName: byTm.get(choice)?.label ?? line.name, how: "a person's pick" });
      continue;
    }
    let ids = new Set<string>();
    for (const v of line.ids) for (const tm of byId.get(v) ?? []) ids.add(tm);
    const named = new Set(exact.get(norm(line.name)) ?? reordered.get(norm(line.name)) ?? []);
    let how = "ID";
    if (ids.size && named.size && ![...ids].some((i) => named.has(i))) {
      ids = named;
      how = "name (the workbook's ID belongs to someone else)";
      notes.push(`${line.name}: the ID in the workbook belongs to someone else, so the name decided.`);
    } else if (!ids.size) {
      ids = named;
      how = "name";
    }
    if (!ids.size) {
      problems.push({ name: line.name, sourceRow: line.source_row, why: "unmatched" });
      continue;
    }
    let tm: string | null = ids.size === 1 ? [...ids][0] : null;
    if (!tm) {
      const dated = [...ids].filter((i) => employedOn(byTm.get(i) as PayrollPerson, run.period));
      if (dated.length === 1) {
        tm = dated[0];
        how += ", by employment dates";
      } else {
        problems.push({ name: line.name, sourceRow: line.source_row, why: "ambiguous" });
        continue;
      }
    }
    const key = `${tm}:${line.contract_kind}`;
    if (seen.has(key)) {
      problems.push({ name: line.name, sourceRow: line.source_row, why: "twice in one month" });
      continue;
    }
    seen.add(key);
    lines.push({ ...line, team_member_id: tm, matchedName: byTm.get(tm)?.label ?? line.name, how });
  }

  // The register's TOTAL row is the accountant's own sum; the lines must add
  // up to it. Each line is rounded to whole VND, so the sum may drift by one
  // per line.
  for (const [col, total] of Object.entries(run.totals)) {
    const sum = run.lines.reduce((s, l) => s + ((l[col] as number | null) ?? 0), 0);
    if (Math.abs(sum - total) > run.lines.length) notes.push(`The lines do not add up to the TOTAL row for ${col.replace(/_vnd$/, "").replace(/_/g, " ")}.`);
  }
  return { lines, problems, notes };
}
