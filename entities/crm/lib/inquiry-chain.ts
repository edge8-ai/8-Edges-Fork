import { readRoutineMode, routineSwitches } from "@/kernel/audit/routine-config";
import { insideShadow } from "@/kernel/audit/run-context";
import { currentRunMode, recordRoutineRun } from "@/kernel/audit/routine-runs";
import { stepTick, type DrivenAgent, type DrivenRun } from "@/kernel/audit/step-driver";
import { notifyOps } from "@/kernel/messaging/lark";
import { qualifyInquiry } from "./inquiry-qualify";
import { gaveUpPatch, runStep, type StepDeps } from "./inquiry-chain-steps";
import { supabaseLeadChainStore } from "./inquiry-chain-store";
import {
  DUE_PER_TICK,
  INQUIRY_CHAIN_ROUTINE_ID,
  INQUIRY_STEP_SECONDS,
  isDrivenStep,
  type DrivenStep,
  type TriageMode,
  type TriageStep,
} from "./inquiry-chain-types";

// The inquiry-to-lead chain (Z.11, R1) as a tick-driven run (ADR 0015). The
// run's step lives on its own row (company_os.inquiry_triage.step); the crm
// cron /api/cron/inquiry-to-lead/ advances every due run by exactly one step
// per tick through the kernel's driveAgents, each step recorded under that
// routine with the tick `<inquiry id>:<started_at>:<step>`, so a step a person
// runs from Read again and the driver's never both run. A failing step is
// backed off (5, 10, 20 minutes); after three attempts giveUp runs.
//
//   form submit → [qualify] → [file] → [notify] → done
//                  shadow:    [qualify] → [notify, recorded only] → done
//
// The switch (decision 4, Z.17). The routine's switch on Settings -> Agents is
// read when the contact route opens a run, and a run keeps the mode it opened
// in. Live only when a person has set the switch to Live: a routine with no
// switch row, which the kernel treats as live, opens shadow runs here, so the
// chain cannot go live by being deployed (as Z.10's proposal chain does). Off
// opens no run at all, and the route takes the path it always took.

// The chain's collaborators, built when first used rather than when the module
// loads, so nothing reachable from the index reads a door value at load.
let overrides: Partial<StepDeps> = {};
let defaults: StepDeps | null = null;

function deps(): StepDeps {
  defaults ??= {
    store: supabaseLeadChainStore(),
    model: qualifyInquiry,
    notify: (line) => notifyOps(line),
    origin: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    now: () => new Date(),
  };
  return { ...defaults, ...overrides };
}

/** For tests: replace the store, the model, the post or the clock; null restores the defaults. */
export function useLeadChainDeps(next: Partial<StepDeps> | null): void {
  overrides = next ? { ...overrides, ...next } : {};
}

export type StepResult =
  | { ok: true; id: string; step: DrivenStep; next: TriageStep; summary: string }
  | { ok: false; id: string; step: DrivenStep; error: string }
  | { skipped: string; id: string }
  | { waiting: string; id: string };

/** What a person's button gets back: a wait reads as skipped, with its reason. */
export type RunNowResult = Exclude<StepResult, { waiting: string }>;

/** Run the step the inquiry's run is at, and move it on from that step only. */
export async function advance(id: string): Promise<StepResult> {
  const row = await deps().store.triage(id);
  if (!row) return { skipped: "This inquiry has no run.", id };
  if (!isDrivenStep(row.step)) return { skipped: `The run is at ${row.step}, not at a step.`, id };
  const step = row.step;
  // A run opened live posts its line only in a live tick. In a shadow tick it
  // waits at notify, neither posting nor recording the line as if it were the
  // only one Operations will get, and the wait is not a failed attempt.
  if (step === "notify" && row.mode === "live" && currentRunMode() === "shadow") {
    return { waiting: "The chain is in shadow, so this line waits until the switch on Settings → Agents is Live.", id };
  }
  try {
    const out = await runStep(step, row, deps());
    const moved = await deps().store.move(id, { step, startedAt: row.started_at }, { ...out.patch, step: out.next, error: null });
    if (!moved) return { ok: false, id, step, error: "The run moved while this step ran; nothing more was done." };
    return { ok: true, id, step, next: out.next, summary: out.summary };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // The error is kept on the row for the run panel; the step stays where it
    // was, so the driver retries it.
    await deps().store.move(id, { step, startedAt: row.started_at }, { error: error.slice(0, 500) }).catch(() => false);
    return { ok: false, id, step, error };
  }
}

/** A step's HTTP shape, which the run recorder reads (Y.34): a failed step answers 422 and records as an error. */
function stepResponse(result: StepResult): Response {
  if ("waiting" in result) return Response.json({ status: "skipped", reason: result.waiting, id: result.id });
  if ("skipped" in result) return Response.json({ ...result, error: `Nothing run: ${result.skipped}` }, { status: 409 });
  if (!result.ok) return Response.json(result, { status: 422 });
  return Response.json({ ...result, summary: `${result.step}: ${result.summary}` });
}

/**
 * Run the step an inquiry's run is at now, from a person's button, under the
 * step's own tick. A step the driver is running already answers skipped.
 */
export async function runNow(id: string): Promise<RunNowResult> {
  const row = await deps().store.triage(id);
  if (!row || !isDrivenStep(row.step)) return { skipped: "The run is not at a step.", id };
  const at: DrivenRun = { id, epoch: row.started_at, step: row.step };
  const holder: { result: StepResult | null } = { result: null };
  const res = await recordRoutineRun(
    INQUIRY_CHAIN_ROUTINE_ID,
    async () => {
      holder.result = await advance(id);
      return stepResponse(holder.result);
    },
    "vercel",
    { tick: stepTick(at), stepSeconds: INQUIRY_STEP_SECONDS, shadowCapable: true },
  );
  if (holder.result) {
    const r = holder.result;
    return "waiting" in r ? { skipped: r.waiting, id: r.id } : r;
  }
  let reason = "The step is already running.";
  try {
    const body = (await res.json()) as { reason?: string };
    if (body.reason && body.reason !== "tick-taken") reason = `Not run: ${body.reason}.`;
  } catch {
    // An unreadable answer keeps the tick-taken wording.
  }
  return { skipped: reason, id };
}

export type IntakeMode = TriageMode | "off";

// The longest the contact route waits for the switch. A visitor is waiting on
// the response, so a slow read takes the old path rather than hold them.
const SWITCH_READ_MS = 1500;

/**
 * The mode a new run opens in. Live only when a person has set the switch to
 * Live, and never inside a shadow run; off when the switch is off; shadow
 * otherwise, a switch that cannot be read included: shadow keeps the path the
 * route always took and only records, which is safe on any guess.
 */
export async function openingMode(): Promise<IntakeMode> {
  if (currentRunMode() === "shadow") return "shadow";
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), SWITCH_READ_MS);
    });
    const switches = await Promise.race([routineSwitches(), timedOut]).finally(() => clearTimeout(timer));
    if (switches === "timeout") {
      console.error(`[inquiry-chain] the switch took longer than ${SWITCH_READ_MS} ms; taking the path without the chain`);
      return "off";
    }
    const mode = switches.get(INQUIRY_CHAIN_ROUTINE_ID)?.mode;
    return mode === "live" ? "live" : mode === "paused" ? "off" : "shadow";
  } catch (err) {
    console.error(`[inquiry-chain] the switch could not be read; opening in shadow: ${err instanceof Error ? err.message : String(err)}`);
    return "shadow";
  }
}

export type Intake = {
  mode: IntakeMode;
  /** True when the route must promote and post as it always did: the chain is off or in shadow, or the run could not be opened. */
  todaysPath: boolean;
};

/**
 * The contact route's hand-off, after it has written the person and the
 * inquiry. Live: a run is opened and the chain promotes and posts; if the run
 * cannot be written the route takes today's path for this inquiry. Shadow:
 * today's path, plus a run that only records. Off: today's path, no run. Z.4's
 * email intake calls this the same way once it exists.
 */
export async function openInquiryRun(inquiryId: string): Promise<Intake> {
  const mode = await openingMode();
  if (mode === "off") return { mode, todaysPath: true };
  try {
    await deps().store.open(inquiryId, mode);
    return { mode, todaysPath: mode === "shadow" };
  } catch (err) {
    console.error(`[inquiry-chain] ${inquiryId}: the run could not be opened; taking the path without the chain: ${err instanceof Error ? err.message : String(err)}`);
    return { mode, todaysPath: true };
  }
}

async function dueRuns(): Promise<DrivenRun[]> {
  // In a shadow tick a live run at notify waits for Live (advance says why).
  const rows = await deps().store.due(DUE_PER_TICK, currentRunMode() === "shadow" ? { skipLiveNotify: true } : {});
  return rows.map((r) => ({ id: r.inquiry_id, epoch: r.started_at, step: r.step }));
}

/**
 * The runs that still move when the switch is Off: the ones opened Live, which
 * the contact route handed over without promoting or posting, so stopping them
 * would leave an inquiry with no lead and no line until someone turned the
 * chain back on. Off stops the chain taking new inquiries; it does not strand
 * the ones it already took. Runs opened in shadow wait.
 */
async function liveDueRuns(): Promise<DrivenRun[]> {
  const rows = await deps().store.due(DUE_PER_TICK, { mode: "live" });
  return rows.map((r) => ({ id: r.inquiry_id, epoch: r.started_at, step: r.step }));
}

/** Whether the switch is Off right now; a switch that cannot be read is not Off. */
export async function chainIsOff(): Promise<boolean> {
  const read = await readRoutineMode(INQUIRY_CHAIN_ROUTINE_ID);
  return read.ok && read.mode === "paused";
}

/** Stop or fall back after the third failed attempt at a step; Operations hears of a stop once. */
async function giveUp(id: string, step: string, error: string): Promise<void> {
  const row = await deps().store.triage(id);
  if (!row || row.step !== step) return;
  const { next, patch } = gaveUpPatch(row, step, error.slice(0, 500), deps().now());
  const moved = await deps().store.move(id, { step: row.step as TriageStep, startedAt: row.started_at }, { ...patch, step: next });
  if (moved && next === "stopped") {
    const alert = () =>
      deps().notify(`The inquiry-to-lead chain stopped an inquiry at ${step} after three attempts: ${error.slice(0, 300)}. Read again on the Inquiries board restarts it: ${deps().origin}/admin/revenue/inquiries`);
    // A run opened in shadow sends nothing, its stop alert included.
    await (row.mode === "shadow" ? insideShadow(INQUIRY_CHAIN_ROUTINE_ID, alert) : alert());
  }
}

/** The chain as the tick driver drives it. */
export const inquiryDriven: DrivenAgent = {
  routineId: INQUIRY_CHAIN_ROUTINE_ID,
  stepSeconds: INQUIRY_STEP_SECONDS,
  shadow: true,
  dueRuns,
  runStep: async (id) => stepResponse(await advance(id)),
  giveUp,
};

/** The chain while its switch is Off: only the runs opened Live, driven past the pause. */
export const inquiryDrivenWhileOff: DrivenAgent = { ...inquiryDriven, dueRuns: liveDueRuns, honourPause: false };

/**
 * Read an inquiry again (a person's button): restart its run at qualify under a
 * new epoch, clearing the old read and any correction of it, then run qualify
 * inline. A run keeps the mode it opened in and what it already filed: a run
 * that was filed goes from qualify to notify without filing again, so a lead a
 * person disqualified never comes back. An inquiry with no run opens one in
 * shadow, always: the route already promoted it and posted its line. The
 * person's saved GPCT answers live in person_qualifications and are never
 * touched.
 */
export async function readInquiryAgainNow(inquiryId: string): Promise<{ ok: true; result: RunNowResult } | { ok: false; error: string }> {
  const row = await deps().store.triage(inquiryId);
  if (!row) {
    await deps().store.open(inquiryId, "shadow");
    return { ok: true, result: await runNow(inquiryId) };
  }
  const moved = await deps().store.move(inquiryId, { step: row.step as TriageStep, startedAt: row.started_at }, {
    step: "qualify",
    started_at: deps().now().toISOString(),
    error: null,
    verdict: null,
    not_sales_kind: null,
    fit: null,
    reasons: null,
    gpct_suggested: null,
    injection_suspected: false,
    company_match: null,
    possible_duplicate_ids: null,
    customer_deal_id: null,
    would_route: null,
    prompt_version: null,
    qualified_at: null,
    company_id: null,
    company_created: null,
    notice: null,
    notified_at: null,
    review: null,
    corrected_verdict: null,
    corrected_fit: null,
    reviewed_by: null,
    reviewed_at: null,
  });
  if (!moved) return { ok: false, error: "The run moved a moment ago. Reload to see where it is." };
  return { ok: true, result: await runNow(inquiryId) };
}
