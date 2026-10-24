import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { DRIVEN_STEPS, SUPERSEDABLE_STEPS, isClientStatusStep, type ClientStatusStep } from "./steps";
import { isStatusWeek } from "./week";

// The one module that reads and writes company_os.client_status_reports (Z.12).
// Every move between steps is one conditional update: it names the step (or
// steps) the row must still be at, and answers whether it moved, so two ticks,
// or a tick and a button, racing each other move a row once. There is no
// delete: the table grants service_role select, insert and update only, and a
// report is never removed, only superseded.

export type StatusReport = {
  id: string;
  companyId: string;
  week: string;
  step: ClientStatusStep;
  startedAt: string;
  facts: unknown;
  aiDraft: unknown;
  bodyHtml: string | null;
  version: string | null;
  editedBy: string | null;
  editedAt: string | null;
  error: string | null;
  createdAt: string;
};

// released_at and released_by are not read: since Z.12.1 nothing is released,
// so both stay null on every row and the table's released_is_whole check holds.
const COLUMNS = "id, company_id, week, step, started_at, facts, ai_draft, body_html, version, edited_by, edited_at, error, created_at";
const LIST_COLUMNS = "id, company_id, week, step, started_at, version, error, edited_at, created_at";

type Row = {
  id: string;
  company_id: string;
  week: string;
  step: string;
  started_at: string;
  facts?: unknown;
  ai_draft?: unknown;
  body_html?: string | null;
  version: string | null;
  edited_by?: string | null;
  edited_at: string | null;
  error: string | null;
  created_at: string;
};

function toReport(r: Row): StatusReport {
  if (!isClientStatusStep(r.step)) throw new Error(`client_status_reports ${r.id}: unknown step "${r.step}"`);
  return {
    id: r.id,
    companyId: r.company_id,
    week: r.week,
    step: r.step,
    startedAt: r.started_at,
    facts: r.facts ?? null,
    aiDraft: r.ai_draft ?? null,
    bodyHtml: r.body_html ?? null,
    version: r.version,
    editedBy: r.edited_by ?? null,
    editedAt: r.edited_at,
    error: r.error,
    createdAt: r.created_at,
  };
}

const table = () => companyOs.from("client_status_reports");

/**
 * Open one report per company for `week`, at gather. A company that already has
 * this week's row keeps it: the unique (company_id, week) is the run's
 * idempotency key, so the opener run twice opens nothing new. Answers how many
 * rows it opened.
 */
export async function openReports(companyIds: string[], week: string): Promise<{ ok: true; opened: number } | { ok: false; error: string }> {
  if (!isStatusWeek(week)) return { ok: false, error: `"${week}" is not an ISO week.` };
  if (companyIds.length === 0) return { ok: true, opened: 0 };
  const { data, error } = await table()
    .upsert(companyIds.map((company_id) => ({ company_id, week })), { onConflict: "company_id,week", ignoreDuplicates: true })
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, opened: (data ?? []).length };
}

/** One report, or null when there is none. A failed read raises. */
export async function loadReport(id: string): Promise<StatusReport | null> {
  const rows = mustRows(await table().select(COLUMNS).eq("id", id).limit(1), "[client-status] report");
  return rows[0] ? toReport(rows[0] as Row) : null;
}

/** Every report of one week (the list columns: no facts, no page). */
export async function reportsOfWeek(week: string): Promise<StatusReport[]> {
  return (mustRows(await table().select(LIST_COLUMNS).eq("week", week), "[client-status] week") as Row[]).map(toReport);
}

/** Every report the tick driver advances. */
export async function drivenReports(): Promise<StatusReport[]> {
  return (mustRows(await table().select(LIST_COLUMNS).in("step", [...DRIVEN_STEPS]), "[client-status] due") as Row[]).map(toReport);
}

/** Reports of weeks before `week` that never reached a client and never will. */
export async function supersedableBefore(week: string): Promise<StatusReport[]> {
  return (
    mustRows(await table().select(LIST_COLUMNS).lt("week", week).in("step", [...SUPERSEDABLE_STEPS]), "[client-status] stale") as Row[]
  ).map(toReport);
}

/** One company's reports, newest week first, with their pages. */
export async function reportsOfCompany(companyId: string, limit: number): Promise<StatusReport[]> {
  return (
    mustRows(await table().select(COLUMNS).eq("company_id", companyId).order("week", { ascending: false }).limit(limit), "[client-status] company") as Row[]
  ).map(toReport);
}

export type ReportPatch = {
  step?: ClientStatusStep;
  facts?: unknown;
  aiDraft?: unknown;
  bodyHtml?: string | null;
  version?: string | null;
  editedBy?: string | null;
  editedAt?: string | null;
  error?: string | null;
  startedAt?: string;
};

/**
 * Move a report on, only from one of `from` (and, with `version`, only while
 * it still carries that version). Answers whether this call moved it.
 */
export async function moveReport(
  id: string,
  from: readonly ClientStatusStep[],
  patch: ReportPatch,
  version?: string,
): Promise<{ ok: true; moved: boolean } | { ok: false; error: string }> {
  const row: TablesUpdate<{ schema: "company_os" }, "client_status_reports"> = { updated_at: new Date().toISOString() };
  if (patch.step !== undefined) row.step = patch.step;
  if (patch.facts !== undefined) row.facts = patch.facts as Json;
  if (patch.aiDraft !== undefined) row.ai_draft = patch.aiDraft as Json;
  if (patch.bodyHtml !== undefined) row.body_html = patch.bodyHtml;
  if (patch.version !== undefined) row.version = patch.version;
  if (patch.editedBy !== undefined) row.edited_by = patch.editedBy;
  if (patch.editedAt !== undefined) row.edited_at = patch.editedAt;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  let q = table().update(row).eq("id", id).in("step", [...from]);
  if (version !== undefined) q = q.eq("version", version);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, moved: (data ?? []).length > 0 };
}
