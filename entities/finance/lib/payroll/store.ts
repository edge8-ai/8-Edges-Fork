// Saving a payroll month, and reading the months back, for Finance → Payroll
// (docs/plans/2026-10-10-contractor-portal.md, PR 3). The writing half of
// scripts/payroll/import_payroll.py: the workbook is kept in the private
// payroll-workbooks bucket, and the run and its lines are upserted, keyed on
// (entity, month) and (run, team member, contract kind), so uploading the same
// month again replaces it rather than adding a second copy. Replacing means the
// lines the new workbook no longer has are deleted too: a corrected workbook
// that drops someone must not leave last upload's line counted in the month.
import { companyOs, supabase } from "@/kernel/data/supabase";
import { mustRows, ReadFailure } from "@/kernel/data/read";
import { LINE_KEYS, ZERO_DEFAULT, type ParsedRun } from "./parse";
import type { MatchedLine } from "./match";

export const PAYROLL_BUCKET = "payroll-workbooks";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Where a month's workbook is kept: one file per entity per month, replaced on re-upload. */
export function workbookPath(legalEntityId: string, period: string): string {
  return `${legalEntityId}/${period.slice(0, 7)}.xlsx`;
}

export async function savePayrollRun(input: {
  run: ParsedRun;
  lines: MatchedLine[];
  legalEntityId: string;
  bytes: Uint8Array;
  importedBy: string;
}): Promise<{ runId: string; lines: number }> {
  const { run, lines, legalEntityId, bytes, importedBy } = input;
  const now = new Date().toISOString();
  const { data: saved, error: runError } = await companyOs
    .from("payroll_runs_sensitive")
    .upsert(
      {
        legal_entity_id: legalEntityId,
        period: run.period,
        // Imported history is paid; a month the workbook marks as an estimate
        // has not been paid yet, and stays a draft until its final workbook.
        status: run.isEstimate ? "draft" : "paid",
        is_estimate: run.isEstimate,
        working_days: run.workingDays,
        source_file: run.sourceFile,
        imported_at: now,
        imported_by: importedBy,
        updated_at: now,
      },
      { onConflict: "legal_entity_id,period" },
    )
    .select("id")
    .single();
  if (runError || !saved) throw new Error(`Could not save the month: ${runError?.message ?? "no row came back"}`);

  // A bulk upsert sends one column list for every row, so each row carries
  // every column: a blank amount is 0 where the table defaults to 0, else null.
  const rows = lines.map((l) => {
    const row: Record<string, unknown> = { payroll_run_id: saved.id, team_member_id: l.team_member_id, position: l.position, updated_at: now };
    for (const k of LINE_KEYS) row[k] = l[k] ?? (ZERO_DEFAULT.has(k) ? 0 : null);
    return row;
  });
  const { data: kept, error: linesError } = await companyOs
    .from("payroll_lines_sensitive")
    .upsert(rows as never, { onConflict: "payroll_run_id,team_member_id,contract_kind" })
    .select("id");
  if (linesError) throw new Error(`Could not save the lines: ${linesError.message}`);

  const keptIds = ((kept ?? []) as { id: string }[]).map((l) => l.id);
  let stale = companyOs.from("payroll_lines_sensitive").delete().eq("payroll_run_id", saved.id);
  if (keptIds.length) stale = stale.not("id", "in", `(${keptIds.join(",")})`);
  const { error: staleError } = await stale;
  if (staleError) throw new Error(`Could not remove the lines the new workbook no longer has: ${staleError.message}`);

  // The workbook is stored last, so a save that fails part-way never replaces
  // the file the stored month was read from. Uploading again finishes it.
  const { error: uploadError } = await supabase.storage
    .from(PAYROLL_BUCKET)
    .upload(workbookPath(legalEntityId, run.period), bytes, { contentType: XLSX, upsert: true });
  if (uploadError) throw new Error(`The month was saved, but its workbook could not be stored: ${uploadError.message}`);
  return { runId: saved.id, lines: rows.length };
}

export type PayrollRunSummary = {
  id: string;
  period: string;
  isEstimate: boolean;
  sourceFile: string | null;
  importedAt: string | null;
  importedBy: string | null;
  lines: number;
  netVnd: number;
  paidVnd: number;
};

/** Every payroll month, newest first, with its head count and totals summed from its lines. */
export async function listPayrollRuns(): Promise<PayrollRunSummary[]> {
  const runs = mustRows(
    await companyOs
      .from("payroll_runs_sensitive")
      .select("id, period, is_estimate, source_file, imported_at, imported_by")
      .is("archived_at", null)
      .order("period", { ascending: false }),
    "[finance/payroll] payroll_runs_sensitive",
  ) as { id: string; period: string; is_estimate: boolean; source_file: string | null; imported_at: string | null; imported_by: string | null }[];
  if (runs.length === 0) return [];
  const lines = mustRows(
    await companyOs.from("payroll_lines_sensitive").select("payroll_run_id, net_salary_vnd, paid_vnd").in("payroll_run_id", runs.map((r) => r.id)),
    "[finance/payroll] payroll_lines_sensitive",
  ) as { payroll_run_id: string; net_salary_vnd: number | null; paid_vnd: number | null }[];
  return runs.map((r) => {
    const mine = lines.filter((l) => l.payroll_run_id === r.id);
    return {
      id: r.id,
      period: r.period,
      isEstimate: r.is_estimate,
      sourceFile: r.source_file,
      importedAt: r.imported_at,
      importedBy: r.imported_by,
      lines: mine.length,
      netVnd: mine.reduce((s, l) => s + Number(l.net_salary_vnd ?? 0), 0),
      paidVnd: mine.reduce((s, l) => s + Number(l.paid_vnd ?? 0), 0),
    };
  });
}

export type PayrollLineView = {
  teamMemberId: string;
  position: string | null;
  contractKind: string;
  daysWorked: number | null;
  grossVnd: number | null;
  totalIncomeVnd: number | null;
  pitVnd: number;
  netVnd: number | null;
  paidVnd: number | null;
};

/** One month's run and its lines; null when there is no such month. */
export async function getPayrollRun(id: string): Promise<{ run: PayrollRunSummary & { legalEntityId: string; workingDays: number | null }; lines: PayrollLineView[] } | null> {
  const { data: run, error } = await companyOs
    .from("payroll_runs_sensitive")
    .select("id, legal_entity_id, period, is_estimate, working_days, source_file, imported_at, imported_by")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ReadFailure("[finance/payroll] payroll_runs_sensitive", error.message);
  if (!run) return null;
  const rows = mustRows(
    await companyOs
      .from("payroll_lines_sensitive")
      .select("team_member_id, position, contract_kind, days_worked, gross_salary_vnd, total_income_vnd, pit_vnd, net_salary_vnd, paid_vnd")
      .eq("payroll_run_id", id)
      .order("source_row", { ascending: true }),
    "[finance/payroll] payroll_lines_sensitive",
  ) as {
    team_member_id: string; position: string | null; contract_kind: string; days_worked: number | null; gross_salary_vnd: number | null;
    total_income_vnd: number | null; pit_vnd: number; net_salary_vnd: number | null; paid_vnd: number | null;
  }[];
  const lines = rows.map((l) => ({
    teamMemberId: l.team_member_id,
    position: l.position,
    contractKind: l.contract_kind,
    daysWorked: l.days_worked === null ? null : Number(l.days_worked),
    grossVnd: l.gross_salary_vnd === null ? null : Number(l.gross_salary_vnd),
    totalIncomeVnd: l.total_income_vnd === null ? null : Number(l.total_income_vnd),
    pitVnd: Number(l.pit_vnd ?? 0),
    netVnd: l.net_salary_vnd === null ? null : Number(l.net_salary_vnd),
    paidVnd: l.paid_vnd === null ? null : Number(l.paid_vnd),
  }));
  return {
    run: {
      id: run.id,
      legalEntityId: run.legal_entity_id,
      period: run.period,
      isEstimate: run.is_estimate,
      workingDays: run.working_days === null ? null : Number(run.working_days),
      sourceFile: run.source_file,
      importedAt: run.imported_at,
      importedBy: run.imported_by,
      lines: lines.length,
      netVnd: lines.reduce((s, l) => s + (l.netVnd ?? 0), 0),
      paidVnd: lines.reduce((s, l) => s + (l.paidVnd ?? 0), 0),
    },
    lines,
  };
}

export type WorkbookLink = { url: string; error: null } | { url: null; error: string | null };

/**
 * A link to download a month's stored workbook, good for five minutes. `url` is
 * null when no workbook was stored for the month. Any other Storage failure
 * comes back as `error`, so the page can say the file could not be reached
 * instead of claiming the month has none.
 */
export async function workbookLink(legalEntityId: string, period: string): Promise<WorkbookLink> {
  const { data, error } = await supabase.storage.from(PAYROLL_BUCKET).createSignedUrl(workbookPath(legalEntityId, period), 300);
  if (!error && data) return { url: data.signedUrl, error: null };
  if (error && isMissingObject(error)) return { url: null, error: null };
  return { url: null, error: error?.message ?? "no link came back" };
}

// Storage answers a missing object with 404 in either status field, depending
// on the server version, and always with "not found" in the message.
function isMissingObject(error: { message: string; status?: number; statusCode?: string }): boolean {
  return error.status === 404 || error.statusCode === "404" || /not found/i.test(error.message);
}
