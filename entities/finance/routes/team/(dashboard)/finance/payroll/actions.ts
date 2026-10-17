"use server";

// Finance → Payroll's upload: read a month's workbook, show who it pays and
// anything that stops it saving, then save it (docs/plans/2026-10-10-
// contractor-portal.md, PR 3). Both steps read the uploaded file afresh, so
// what is saved is exactly what was previewed. Nothing is written while any
// line is unmatched, ambiguous or twice in one month.
import { revalidatePath } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { requirePermission } from "@/kernel/identity/access-request";
import { parseWorkbook } from "@/entities/finance/lib/payroll/parse";
import { matchRun, type Problem } from "@/entities/finance/lib/payroll/match";
import { savePayrollRun } from "@/entities/finance/lib/payroll/store";
import { payrollPeople, vietnamEntityId } from "./payroll-people";

export type PayrollPreview =
  | {
      ok: true;
      period: string;
      isEstimate: boolean;
      lines: number;
      matched: { name: string; matchedName: string; how: string; kind: string }[];
      problems: Problem[];
      notes: string[];
      unknownLabels: string[];
      alreadySaved: boolean;
      // Everyone a line could be paid to, for picking by hand the rows the
      // rules could not match.
      people: { teamMemberId: string; name: string }[];
    }
  | { ok: false; error: string };

/** The rows a person matched by hand: "picked" is JSON of { sourceRow: teamMemberId }. */
function pickedRows(formData: FormData): Record<number, string> {
  try {
    const raw = JSON.parse(String(formData.get("picked") ?? "{}")) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [Number(k), v as string]));
  } catch {
    return {};
  }
}

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose the month's payroll workbook (.xlsx).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const run = parseWorkbook(bytes, file.name);
  const [people, legalEntityId] = await Promise.all([payrollPeople(), vietnamEntityId()]);
  return { bytes, run, legalEntityId, people, match: matchRun(run, people, pickedRows(formData)) };
}

export async function previewPayroll(formData: FormData): Promise<PayrollPreview> {
  await requirePermission("finance.payroll");
  try {
    const { run, legalEntityId, people, match } = await readUpload(formData);
    const { data: existing, error } = await companyOs
      .from("payroll_runs_sensitive")
      .select("id")
      .eq("legal_entity_id", legalEntityId)
      .eq("period", run.period)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      period: run.period,
      isEstimate: run.isEstimate,
      lines: run.lines.length,
      matched: match.lines.map((l) => ({ name: l.name, matchedName: l.matchedName, how: l.how, kind: l.contract_kind })),
      problems: match.problems,
      notes: match.notes,
      unknownLabels: run.unknownLabels,
      alreadySaved: Boolean(existing),
      people: people
        .map((p) => ({ teamMemberId: p.teamMemberId, name: p.label }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the workbook." };
  }
}

export async function savePayroll(formData: FormData): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const { user } = await requirePermission("finance.payroll");
  try {
    const { bytes, run, legalEntityId, match } = await readUpload(formData);
    if (match.problems.length > 0) return { ok: false, error: "Some lines are not matched to a team member yet, so nothing was saved." };
    const saved = await savePayrollRun({ run, lines: match.lines, legalEntityId, bytes, importedBy: user.email });
    await recordAudit({
      table: "payroll_runs_sensitive",
      recordId: saved.runId,
      operation: "update",
      actor: user.email,
      context: { action: "payroll_upload", period: run.period, lines: saved.lines, source_file: run.sourceFile },
    });
    revalidatePath("/team/finance/payroll");
    return { ok: true, runId: saved.runId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the month." };
  }
}
