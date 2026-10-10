import { contentVersion } from "@/kernel/approvals/version";
import { once } from "@/kernel/audit/effects";
import { recordRoutineRun } from "@/kernel/audit/routine-runs";
import { stepTick, type DrivenAgent, type DrivenRun } from "@/kernel/audit/step-driver";
import { mustRows } from "@/kernel/data/read";
import { notifyOps } from "@/kernel/messaging/lark";
import { activeClientCompanies } from "../active-clients";
import { selectClientBacklogItems, selectProgramDocuments } from "../reads";
import { checkStatusPage, refusalText } from "./check";
import { clientStatusDraftOutput, draftNarrative, type StatusNarrative } from "./draft";
import { gatherFacts, statusFacts, STATUS_SECTIONS, type BoardInput, type DocumentInput, type RoadmapInput, type StatusFacts } from "./facts";
import { OWN_COMPANIES } from "./own-companies";
import { renderStatusPage } from "./render";
import { CLIENT_STATUS_ROUTINE_ID, CLIENT_STATUS_STEP_SECONDS, isDrivenStep, type ClientStatusStep, type DrivenStep } from "./steps";
import { drivenReports, loadReport, moveReport, reportsOfWeek, supersedableBefore, type StatusReport } from "./store";
import { statusTitle, weekStartsAt } from "./week";

// The weekly client status run, one step per tick (Z.12, spec §3; ADR 0015).
// The tick driver (kernel/audit/step-driver.ts, run from this entity's
// client-status-driver cron) advances every report at gather, draft or check
// by exactly one step, recorded under the opener's routine id with the tick
// `<report>:<started at>:<step>`; a person's button runs the step the report is
// at under the same tick, so a step never runs twice. A step that fails is
// retried at 5, 10 and 20 minutes, then the report stops with the error. Every
// step is idempotent: gather and draft overwrite their own columns, and check
// is a conditional update.
//
// The run ends at ready (Z.12.1): a page that passes the check is the account
// owner's draft on the client's Weekly status page. It opens no approval,
// sends nobody a note about one and is never released anywhere; the owner
// edits it and shares it with the client themselves.
//
// The board is read through the boards entity, which sits above this one in
// the entity graph, so the caller hands the read in (`ClientStatusDeps`): the
// cron routes and the review page's actions, which may import any door.

export type ClientStatusDeps = {
  /** The client's board, as the board's client-safe read returns it. Throws when it cannot be read. */
  readBoard: (companyId: string) => Promise<BoardInput>;
  /** The site's origin, for the links in the Ops note. */
  origin: () => Promise<string>;
};

export type StepOutcome =
  | { ok: true; reportId: string; step: DrivenStep; next: ClientStatusStep; summary: string }
  | { ok: false; reportId: string; step: DrivenStep; error: string }
  | { skipped: string; reportId: string };

const CHECK_MARK = "check: ";

function parseFacts(report: StatusReport): StatusFacts | null {
  const parsed = statusFacts.safeParse(report.facts);
  return parsed.success ? parsed.data : null;
}

export function parseNarrative(raw: unknown): StatusNarrative | null {
  const parsed = clientStatusDraftOutput.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function lineCount(narrative: StatusNarrative | null): number {
  return narrative ? STATUS_SECTIONS.reduce((n, k) => n + narrative[k].length, 0) : 0;
}

/**
 * The version of a week's page: a hash of what the account owner would share.
 * An edit names the version it was made on, so an edit saved over a page that
 * changed since (a redraft, or a colleague's edit) is refused, never lost.
 */
export function reportVersion(r: { companyId: string; week: string; bodyHtml: string }): string {
  return contentVersion({ companyId: r.companyId, week: r.week, title: statusTitle(r.week), bodyHtml: r.bodyHtml });
}

/** The active clients, and so who this report's client is and whom its page must not name. */
async function clients(): Promise<Map<string, { company: string; programIds: string[] }>> {
  const active = await activeClientCompanies(OWN_COMPANIES);
  if (!active.ok) throw new Error(`active clients: ${active.error}`);
  return active.clients;
}

async function gather(report: StatusReport, deps: ClientStatusDeps): Promise<{ next: ClientStatusStep; summary: string }> {
  const client = (await clients()).get(report.companyId);
  if (!client) throw new Error("this company has no active AI program any more.");
  // A failed read is never drafted as "nothing happened" (CLAUDE.md rule 2):
  // the board read raises, and so do these two.
  const board = await deps.readBoard(report.companyId);
  const roadmap = mustRows(
    await selectClientBacklogItems("id, title, status, client_priority, edge8_priority, source, updated_at").eq("company_id", report.companyId).is("archived_at", null),
    "[client-status] client_backlog_items",
  ) as unknown as RoadmapInput[];
  const documents = mustRows(
    await selectProgramDocuments("id, filename, created_at").eq("company_id", report.companyId).gte("created_at", weekStartsAt(report.week)),
    "[client-status] program_documents",
  ) as unknown as DocumentInput[];
  const facts = gatherFacts({ company: client.company, week: report.week, board, roadmap, documents });
  const moved = await moveReport(report.id, ["gather"], { facts, step: "draft" });
  if (!moved.ok) throw new Error(moved.error);
  return { next: "draft", summary: `Gathered ${facts.items.length} facts.` };
}

async function draft(report: StatusReport): Promise<{ next: ClientStatusStep; summary: string }> {
  const facts = parseFacts(report);
  if (!facts) throw new Error("the report's facts are missing or unreadable; draft again to gather them anew.");
  const failedRule = report.error?.startsWith(CHECK_MARK) ? report.error.slice(CHECK_MARK.length) : null;
  const drafted = await draftNarrative(facts, failedRule);
  if (!drafted.ok) throw new Error(`the model could not draft: ${drafted.error}`);
  const moved = await moveReport(report.id, ["draft"], { aiDraft: drafted.narrative, bodyHtml: renderStatusPage(facts, drafted.narrative), step: "check" });
  if (!moved.ok) throw new Error(moved.error);
  return { next: "check", summary: `Drafted ${lineCount(drafted.narrative)} lines.` };
}

async function check(report: StatusReport, now: Date): Promise<{ next: ClientStatusStep; summary: string }> {
  const facts = parseFacts(report);
  if (!facts || !report.bodyHtml) throw new Error("there is no page to check.");
  const narrative = report.aiDraft === null ? null : parseNarrative(report.aiDraft);
  if (report.aiDraft !== null && !narrative) throw new Error("the draft is unreadable; draft again.");
  const all = await clients();
  const otherClients = [...all].filter(([id]) => id !== report.companyId).map(([, c]) => c.company);
  const result = checkStatusPage({ bodyHtml: report.bodyHtml, narrative, facts, otherClients });
  if (result.ok) {
    // The end of the run: the draft waits on the account owner, and nothing
    // is asked of anyone else.
    const version = reportVersion({ companyId: report.companyId, week: report.week, bodyHtml: report.bodyHtml });
    const moved = await moveReport(report.id, ["check"], { step: "ready", error: null, version });
    if (!moved.ok) throw new Error(moved.error);
    return { next: "ready", summary: `The page passed every check; draft ${version} is ready for the account owner.` };
  }
  // A draft refused once goes back to draft, on a fresh epoch, with the rule;
  // refused again, or a plain report refused (nothing to redraft), it stops.
  const rule = refusalText(result);
  if (narrative && !report.error?.startsWith(CHECK_MARK)) {
    const moved = await moveReport(report.id, ["check"], { step: "draft", error: `${CHECK_MARK}${rule}`, startedAt: now.toISOString() });
    if (!moved.ok) throw new Error(moved.error);
    return { next: "draft", summary: `Refused by the check (${rule}); drafting once more with the rule.` };
  }
  const moved = await moveReport(report.id, ["check"], { step: "stopped", error: `The check refused the page${narrative ? " twice" : ""}: ${rule}` });
  if (!moved.ok) throw new Error(moved.error);
  return { next: "stopped", summary: `Stopped: the check refused the page (${rule}).` };
}

/** Run the one step the report is at. Never throws: a failure is an outcome. */
export async function advanceReport(id: string, deps: ClientStatusDeps, now: Date = new Date()): Promise<StepOutcome> {
  const report = await loadReport(id).catch(() => null);
  if (!report) return { skipped: "The report could not be read.", reportId: id };
  if (!isDrivenStep(report.step)) return { skipped: `The report is at ${report.step}; nothing to run.`, reportId: id };
  const step = report.step;
  try {
    let done: { next: ClientStatusStep; summary: string };
    if (step === "gather") done = await gather(report, deps);
    else if (step === "draft") done = await draft(report);
    else done = await check(report, now);
    if (done.next === "ready" || done.next === "stopped") await noteIfWeekSettled(report.week, deps);
    return { ok: true, reportId: id, step, next: done.next, summary: done.summary };
  } catch (err) {
    return { ok: false, reportId: id, step, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Once none of a week's reports is still being written, Operations hears once
 * which clients got no draft. It goes through the effect ledger, so a re-run or
 * a retry never posts twice. A week whose drafts are all ready posts nothing:
 * each draft waits on its account owner, not on anyone in the Ops chat.
 */
export async function noteIfWeekSettled(week: string, deps: ClientStatusDeps): Promise<void> {
  try {
    const rows = await reportsOfWeek(week);
    if (rows.some((r) => r.step === "gather" || r.step === "draft" || r.step === "check")) return;
    const stopped = rows.filter((r) => r.step === "stopped");
    if (stopped.length === 0) return;
    const origin = await deps.origin();
    const all = await clients().catch(() => new Map<string, { company: string }>());
    const list = stopped.map((r) => `${all.get(r.companyId)?.company ?? r.companyId} (${r.error ?? "stopped"}) ${origin}/team/clients/${r.companyId}/status`).join("; ");
    await once(`client-status:failed-note:${week}`, "lark", async () =>
      (await notifyOps(`Weekly client status, week ${week}: ${stopped.length} client(s) got no draft: ${list}. Each can use the plain report or draft again on its Weekly status page.`))
        ? { ok: true }
        : { ok: false, error: "the Ops note did not go through" },
    );
  } catch (err) {
    console.error(`[client-status] week ${week}: the settled note could not be sent:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Next Friday's opener: every earlier week whose run never produced a draft is
 * superseded, so the driver stops running a stale week. A ready draft is left
 * alone, because its account owner may already have shared it. Answers how
 * many it superseded and what failed.
 */
export async function supersedeBefore(week: string): Promise<{ superseded: number; failures: { subject: string; error: string }[] }> {
  let stale: StatusReport[];
  try {
    stale = await supersedableBefore(week);
  } catch (err) {
    return { superseded: 0, failures: [{ subject: "earlier weeks", error: err instanceof Error ? err.message : String(err) }] };
  }
  let superseded = 0;
  const failures: { subject: string; error: string }[] = [];
  for (const report of stale) {
    const moved = await moveReport(report.id, [report.step], { step: "superseded" });
    if (!moved.ok) failures.push({ subject: `${report.companyId} ${report.week}`, error: moved.error });
    else if (moved.moved) superseded += 1;
  }
  return { superseded, failures };
}

// What a step answers as an HTTP response inside its claimed tick. A step with
// nothing to run must not close the tick as skipped, which claim_tick would then
// refuse for good, so it records as an error that says why.
function tickResponse(outcome: StepOutcome): Response {
  if ("skipped" in outcome) return Response.json({ ...outcome, error: `Nothing run: ${outcome.skipped}` }, { status: 409 });
  if (!outcome.ok) return Response.json(outcome, { status: 500 });
  return Response.json(outcome);
}

const runOf = (r: Pick<StatusReport, "id" | "startedAt" | "step">): DrivenRun => ({ id: r.id, epoch: r.startedAt, step: r.step });

/**
 * Run the step the report is at now, from a person's button, recorded under
 * that step's own tick. A step the driver is running already answers skipped.
 */
export async function runClientStatusStepNow(id: string, deps: ClientStatusDeps): Promise<StepOutcome> {
  const report = await loadReport(id).catch(() => null);
  if (!report || !isDrivenStep(report.step)) return { skipped: "The report is not at a step.", reportId: id };
  const holder: { outcome: StepOutcome } = { outcome: { skipped: "The step is already running.", reportId: id } };
  await recordRoutineRun(
    CLIENT_STATUS_ROUTINE_ID,
    async () => {
      holder.outcome = await advanceReport(id, deps);
      return tickResponse(holder.outcome);
    },
    "vercel",
    { tick: stepTick(runOf(report)), stepSeconds: CLIENT_STATUS_STEP_SECONDS },
  );
  return holder.outcome;
}

/** The run as the tick driver drives it. */
export function clientStatusDriven(deps: ClientStatusDeps): DrivenAgent {
  return {
    routineId: CLIENT_STATUS_ROUTINE_ID,
    stepSeconds: CLIENT_STATUS_STEP_SECONDS,
    dueRuns: async () => (await drivenReports()).map(runOf),
    runStep: async (id) => tickResponse(await advanceReport(id, deps)),
    giveUp: async (id, step, error) => {
      if (!isDrivenStep(step)) return;
      const stopped = await moveReport(id, [step], { step: "stopped", error });
      if (!stopped.ok) console.error(`[client-status] could not stop ${id} at ${step}: ${stopped.error}`);
      const report = await loadReport(id).catch(() => null);
      if (report) await noteIfWeekSettled(report.week, deps);
    },
  };
}
