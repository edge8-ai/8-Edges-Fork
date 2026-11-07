import type { Result } from "@/kernel/data/result";
import { activeClientCompanies } from "../active-clients";
import { CHECK_PROMISES, checkStatusPage, type CheckRule } from "./check";
import { statusFacts, type StatusFact, type StatusFacts, type StatusSection, STATUS_SECTIONS, SECTION_HEADINGS } from "./facts";
import { OWN_COMPANIES } from "./own-companies";
import { PLAIN_SUMMARY, renderStatusPage, summaryOf, withSummary } from "./render";
import { lineCount, parseNarrative, reportVersion, runClientStatusStepNow, type ClientStatusDeps } from "./run-step";
import { REDRAFTABLE_STEPS, type ClientStatusStep } from "./steps";
import { loadReport, moveReport, reportsOfCompany, type StatusReport } from "./store";
import { statusTitle, weekLabel } from "./week";

// What the account owner does with a weekly client status, and what the review
// page reads (Z.12, spec §3 and §11; Z.12.1). The guarded server actions call
// these; nothing here guards.
//
// The draft is the account owner's (Khoa, 9 Oct 2026): they read it on the
// client's Weekly status page, edit it, and share it with the client
// themselves. Nothing here opens an approval, asks anyone to decide, or
// releases the page anywhere.

/** Who edited the draft: recorded on the row as edited_by, never a decision. */
export type Editor = { personId: string | null; email: string };

async function load(id: string): Promise<StatusReport | { failed: string }> {
  try {
    return (await loadReport(id)) ?? { failed: "That report does not exist." };
  } catch (err) {
    return { failed: `The report could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * The company a report belongs to, read from the report's own row, or null
 * when there is no such report. The actions check their scoped permission
 * against this, never against a company the caller names, so nobody edits
 * another client's draft by passing a company of their own. A failed read
 * throws: a guard must not take it for "no such report" and answer anyway.
 */
export async function reportCompanyId(id: string): Promise<string | null> {
  return (await loadReport(id))?.companyId ?? null;
}

async function otherClients(companyId: string): Promise<string[] | { error: string }> {
  const active = await activeClientCompanies(OWN_COMPANIES);
  if (!active.ok) return { error: `The client list could not be read: ${active.error}` };
  return [...active.clients].filter(([id]) => id !== companyId).map(([, c]) => c.company);
}

/**
 * The account owner's edit of the summary (spec decision 9: the narrative only;
 * the board and roadmap come from data). The edited page passes the same check
 * as a draft, so a person cannot type a token figure in either. Saving writes
 * the draft and its new version, and that is all: nobody is asked again.
 */
export async function editSummary(id: string, seenVersion: string, summary: string, by: Editor): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const report = await load(id);
  if ("failed" in report) return { ok: false, error: report.failed };
  if (report.step !== "ready" || !report.bodyHtml) return { ok: false, error: "Only a ready draft can be edited." };
  if (seenVersion !== report.version) return { ok: false, error: "The draft changed since you loaded it. Reload and edit again." };
  const parsed = statusFacts.safeParse(report.facts);
  if (!parsed.success) return { ok: false, error: "The report's facts are unreadable; draft again." };
  const text = summary.trim() || PLAIN_SUMMARY;
  const bodyHtml = withSummary(report.bodyHtml, text);
  const others = await otherClients(report.companyId);
  if ("error" in others) return { ok: false, error: others.error };
  const narrative = report.aiDraft === null ? null : parseNarrative(report.aiDraft);
  const checked = checkStatusPage({ bodyHtml, narrative, facts: parsed.data, otherClients: others });
  if (!checked.ok) return { ok: false, error: `The check refused it: ${checked.detail}` };
  const version = reportVersion({ companyId: report.companyId, week: report.week, bodyHtml });
  if (version === report.version) return { ok: true, version };
  const saved = await moveReport(id, ["ready"], { bodyHtml, version, editedBy: by.personId, editedAt: new Date().toISOString() }, seenVersion);
  if (!saved.ok) return { ok: false, error: `The edit could not be saved: ${saved.error}` };
  if (!saved.moved) return { ok: false, error: "The draft changed as you saved. Reload and read it again." };
  return { ok: true, version };
}

/**
 * Draft again (or Retry a stopped run): a fresh epoch, so the driver counts its
 * attempts from zero, from gather when there are no facts and from draft when
 * there are. It replaces the ready draft, edits included. The step runs here
 * at once.
 */
export async function draftAgain(id: string, deps: ClientStatusDeps): Promise<Result> {
  const report = await load(id);
  if ("failed" in report) return { ok: false, error: report.failed };
  if (!(REDRAFTABLE_STEPS as readonly ClientStatusStep[]).includes(report.step)) return { ok: false, error: "This week's report is not one that can be drafted again." };
  // A week a newer one has replaced is not drafted again: the account owner
  // shares the newest week, and a fresh draft of an older one would only
  // overwrite what they may already have shared.
  let newest: StatusReport | undefined;
  try {
    [newest] = await reportsOfCompany(report.companyId, 1);
  } catch (err) {
    return { ok: false, error: `The client's reports could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (newest && newest.week > report.week) return { ok: false, error: `Week ${newest.week} has opened since, so this week can no longer be drafted again.` };
  const step = statusFacts.safeParse(report.facts).success ? "draft" : "gather";
  const moved = await moveReport(id, [report.step], { step, error: null, startedAt: new Date().toISOString() });
  if (!moved.ok) return moved;
  if (!moved.moved) return { ok: false, error: "The report moved on a moment ago. Reload to see where it is." };
  await runClientStatusStepNow(id, deps);
  return { ok: true };
}

/**
 * A stopped run's plain report: the board and the roadmap with no written
 * summary, through the same check. The check runs here at once, so the account
 * owner has the plain draft as soon as the page reloads.
 */
export async function adoptPlainReport(id: string, deps: ClientStatusDeps): Promise<Result> {
  const report = await load(id);
  if ("failed" in report) return { ok: false, error: report.failed };
  if (report.step !== "stopped") return { ok: false, error: "Only a stopped report can use the plain report." };
  const parsed = statusFacts.safeParse(report.facts);
  if (!parsed.success) return { ok: false, error: "There are no facts for a plain report yet: draft again, which gathers them first." };
  const moved = await moveReport(id, ["stopped"], { bodyHtml: renderStatusPage(parsed.data, null), aiDraft: null, step: "check", error: null, startedAt: new Date().toISOString() });
  if (!moved.ok) return moved;
  if (!moved.moved) return { ok: false, error: "The report moved on a moment ago. Reload to see where it is." };
  await runClientStatusStepNow(id, deps);
  return { ok: true };
}

// ── What the review page reads ────────────────────────────────────────────

export type ReviewLine = { text: string; source: string };
export type ReviewSection = { key: StatusSection; heading: string; lines: ReviewLine[] };
export type ReviewReport = {
  id: string;
  week: string;
  weekLabel: string;
  title: string;
  step: ClientStatusStep;
  startedAt: string;
  error: string | null;
  bodyHtml: string | null;
  summary: string;
  version: string | null;
  plain: boolean;
  sections: ReviewSection[];
  lines: number;
  editedAt: string | null;
  hasFacts: boolean;
};
export type ReviewModel = { company: string; current: ReviewReport | null; past: ReviewReport[]; promises: string[] };

function sourceOf(fact: StatusFact | undefined): string {
  if (!fact) return "Not one of this week's facts";
  const where = fact.kind === "card" ? `Card${fact.lane ? ` (${fact.lane})` : ""}` : fact.kind === "roadmap" ? "Roadmap" : "Document";
  return `${where}: ${fact.title}`;
}

function toReview(r: StatusReport): ReviewReport {
  const facts: StatusFacts | null = statusFacts.safeParse(r.facts).data ?? null;
  const narrative = r.aiDraft === null ? null : parseNarrative(r.aiDraft);
  const byId = new Map((facts?.items ?? []).map((f) => [f.id, f]));
  const sections = narrative
    ? STATUS_SECTIONS.map((key) => ({ key, heading: SECTION_HEADINGS[key], lines: narrative[key].map((l) => ({ text: l.line, source: sourceOf(byId.get(l.factId)) })) })).filter((s) => s.lines.length > 0)
    : [];
  return {
    id: r.id,
    week: r.week,
    weekLabel: weekLabel(r.week),
    title: statusTitle(r.week),
    step: r.step,
    startedAt: r.startedAt,
    error: r.error,
    bodyHtml: r.bodyHtml,
    summary: r.bodyHtml ? summaryOf(r.bodyHtml) : "",
    version: r.version,
    plain: r.bodyHtml !== null && r.aiDraft === null,
    sections,
    lines: lineCount(narrative),
    editedAt: r.editedAt,
    hasFacts: facts !== null,
  };
}

/**
 * One client's weekly status for the review page: this week's report (the
 * newest) and the earlier weeks. Null when the company has no report and no
 * active program: nothing to review.
 */
export async function clientStatusReview(companyId: string): Promise<ReviewModel | null> {
  const [reports, active] = await Promise.all([reportsOfCompany(companyId, 9), activeClientCompanies(OWN_COMPANIES)]);
  if (!active.ok) throw new Error(`active clients: ${active.error}`);
  const name = active.clients.get(companyId)?.company ?? (statusFacts.safeParse(reports[0]?.facts).data?.company ?? null);
  if (!name) return null;
  const [newest, ...rest] = reports;
  const rules = Object.keys(CHECK_PROMISES) as CheckRule[];
  return {
    company: name,
    current: newest ? toReview(newest) : null,
    past: rest.map(toReview),
    promises: rules.map((k) => CHECK_PROMISES[k]),
  };
}
