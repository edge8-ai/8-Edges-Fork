import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { readRoutineMode } from "@/kernel/audit/routine-config";
import { recordRoutineRun } from "@/kernel/audit/routine-runs";
import type { RunMode } from "@/kernel/audit/run-context";
import { stepTick, type DrivenAgent, type DrivenRun } from "@/kernel/audit/step-driver";
import { decisionSubject } from "./ask";
import { advanceApplication } from "./application";
import { closeApplicationRun } from "./close-run";
import { chainDeps } from "./deps";
import { advanceRequisition, autoShortlistDue } from "./requisition";
import {
  APPLICATION_ACTING,
  APPLICATION_SHADOW_SAFE,
  CHAIN_ROUTINE_ID,
  REQUISITION_ACTING,
  REQUISITION_SHADOW_SAFE,
  STEP_SECONDS,
  type ApplicationStep,
  type RequisitionStep,
} from "./steps";
import type { ChainApplication, ChainDeps, ChainRequisition, StepOutcome } from "./types";

// How the hiring chain is driven (ADR 0015): the hiring driver's tick and a
// person's button both run the step a row is at, under the same tick, so a
// step never runs twice. Each step is a routine run under
// /api/cron/hiring-chain/, the switch Settings -> Agents flips between live,
// shadow and off.
//
// A step's tick is `<row>:<run start>:<step>`, and a step that can come round
// again within one run carries what makes this visit different: the message
// it sends, the proposal it asks about, the approval it acts on, the
// shortlist round. claim_tick refuses a tick that passed, so without that a
// second send (an invitation, then later the decision) would never run.

/** The switch, read for the driver's due list and the pages. A failed read raises. */
export async function chainMode(): Promise<"live" | "shadow" | "paused"> {
  const read = await readRoutineMode(CHAIN_ROUTINE_ID);
  if (!read.ok) throw new Error(`The hiring chain's switch could not be read: ${read.error}`);
  return read.mode;
}

// ── which visit of a step this is ──────────────────────────────────────────

async function applicationVisit(app: ChainApplication, deps: ChainDeps): Promise<string> {
  const step = app.step as ApplicationStep;
  if (step === "send") {
    // Keyed on the approval the send acts on, not only the message: a send
    // that sent the message back for approval passes its tick, and the
    // re-approved message must reach a fresh one (review finding 2).
    const msg = (await deps.store.messages(app.id)).find((m) => m.mode === "live" && (m.status === "approved" || m.status === "sending"));
    if (!msg) return "send:none";
    const subject = msg.kind === "invite" || msg.kind === "decline" ? "hiring_message" : msg.kind === "decision_hire" ? "hiring_hire" : "hiring_reject";
    const a = await deps.approvals.latest(subject, subject === "hiring_message" ? msg.id : app.id);
    return `send:${msg.id}:${a?.id ?? msg.version}`;
  }
  if (step === "ask-decision") return `ask-decision:${app.proposal?.proposedAt ?? "none"}`;
  if (step === "decide") {
    const a = app.proposal ? await deps.approvals.latest(decisionSubject(app.proposal.outcome), app.id) : null;
    return `decide:${a?.id ?? "none"}`;
  }
  return step;
}

async function requisitionVisit(req: ChainRequisition, deps: ChainDeps): Promise<string> {
  const step = req.step as RequisitionStep;
  if (step === "open") {
    const a = await deps.approvals.latest("hiring_requisition", req.id);
    return `open:${a?.id ?? "none"}`;
  }
  if (step === "collecting" || step === "shortlist") {
    const rounds = await deps.store.shortlists(req.id);
    return `shortlist:${rounds.length + 1}`;
  }
  if (step === "apply-shortlist") {
    // The approval, so a round asked again after its lanes changed applies under a fresh tick.
    const approved = (await deps.store.shortlists(req.id)).find((s) => s.mode === "live" && s.status === "approved");
    const a = approved ? await deps.approvals.latest("hiring_shortlist", approved.id) : null;
    return `apply-shortlist:${approved?.id ?? "none"}:${a?.id ?? "none"}`;
  }
  return step;
}

async function applicationRun(app: ChainApplication, deps: ChainDeps): Promise<DrivenRun> {
  return { id: app.id, epoch: app.epoch, step: await applicationVisit(app, deps) };
}

async function requisitionRun(req: ChainRequisition, deps: ChainDeps): Promise<DrivenRun> {
  return { id: req.id, epoch: req.epoch, step: await requisitionVisit(req, deps) };
}

// ── the driver's due lists ─────────────────────────────────────────────────

function runnable(mode: RunMode | "paused", step: string, shadowSafe: readonly string[]): boolean {
  return mode === "shadow" ? shadowSafe.includes(step) : true;
}

/** Every application at a step the driver runs, in the switch's mode. */
export async function dueApplicationRuns(deps: ChainDeps = chainDeps): Promise<DrivenRun[]> {
  const mode = await chainMode();
  const rows = mustRows(
    await companyOs
      .from("applications")
      .select("id")
      .in("chain_step", [...APPLICATION_ACTING])
      .is("chain_error", null)
      .is("archived_at", null)
      .limit(100),
    "[hiring/chain] due applications",
  );
  const out: DrivenRun[] = [];
  for (const { id } of rows) {
    const app = await deps.store.application(id);
    if (!app?.step || !runnable(mode, app.step, APPLICATION_SHADOW_SAFE)) continue;
    out.push(await applicationRun(app, deps));
  }
  return out;
}

/** Every requisition at a step the driver runs, and every one collecting with enough new screened applications for a shortlist. */
export async function dueRequisitionRuns(deps: ChainDeps = chainDeps): Promise<DrivenRun[]> {
  const mode = await chainMode();
  const rows = mustRows(
    await companyOs
      .from("job_requisitions")
      .select("id")
      .in("chain_step", [...REQUISITION_ACTING, "collecting"])
      .is("chain_error", null)
      .limit(100),
    "[hiring/chain] due requisitions",
  );
  const out: DrivenRun[] = [];
  for (const { id } of rows) {
    const req = await deps.store.requisition(id);
    if (!req?.step || !runnable(mode, req.step, REQUISITION_SHADOW_SAFE)) continue;
    if (req.step === "collecting") {
      if (req.status !== "open") continue;
      const [apps, rounds] = await Promise.all([deps.store.triageApplications(req.id), deps.store.shortlists(req.id)]);
      if (!autoShortlistDue(apps, rounds, mode === "shadow" ? "shadow" : "live")) continue;
    }
    out.push(await requisitionRun(req, deps));
  }
  return out;
}

/**
 * Every tick, in any mode: applications a person decided by hand (hired,
 * rejected, withdrawn) while their run waited leave the chain, so nothing
 * drafted or proposed for them goes out later, after go-live included
 * (review finding 1). A run at decide or send is the chain's own decision
 * and is left to finish. Answers how many it closed.
 */
export async function sweepDecidedByHand(deps: ChainDeps = chainDeps): Promise<number> {
  const decided = await deps.store.decidedByHand();
  for (const app of decided) {
    await closeApplicationRun(deps, app, null, `A person set this application to ${app.status}; the chain sends it nothing more.`);
  }
  return decided.length;
}

// ── running one step ───────────────────────────────────────────────────────

/**
 * A step's answer as the run recorder reads it. A step with nothing to do
 * must not close its tick as skipped (claim_tick would refuse that tick for
 * good), so it answers 409 and records as an error that says why.
 */
function tickResponse(result: StepOutcome): Response {
  if ("skipped" in result) return Response.json({ ...result, error: `Nothing run: ${result.skipped}` }, { status: 409 });
  if (!result.ok) return Response.json(result, { status: 422 });
  return Response.json(result);
}

async function runNow(kind: "application" | "requisition", id: string, current: () => Promise<DrivenRun | null>, advance: () => Promise<StepOutcome>): Promise<StepOutcome> {
  const at = await current();
  if (!at) return { skipped: "The run is not at a step.", id };
  const holder: { result: StepOutcome | null } = { result: null };
  const res = await recordRoutineRun(
    CHAIN_ROUTINE_ID,
    async () => {
      holder.result = await advance();
      return tickResponse(holder.result);
    },
    "vercel",
    { tick: stepTick(at), stepSeconds: STEP_SECONDS, shadowCapable: true },
  );
  if (holder.result) return holder.result;
  let reason = `The ${kind}'s step is already running.`;
  try {
    const body = (await res.json()) as { reason?: string };
    if (body.reason && body.reason !== "tick-taken") reason = `Not run: ${body.reason}.`;
  } catch {
    // An unreadable answer keeps the tick-taken wording.
  }
  return { skipped: reason, id };
}

/** Run the application's current step now, from a person's button. */
export async function runApplicationNow(id: string, deps: ChainDeps = chainDeps): Promise<StepOutcome> {
  return runNow(
    "application",
    id,
    async () => {
      const app = await deps.store.application(id);
      if (!app?.step || app.error || !(APPLICATION_ACTING as readonly string[]).includes(app.step)) return null;
      return applicationRun(app, deps);
    },
    () => advanceApplication(id, deps),
  );
}

/** Run the requisition's current step now, from a person's button. */
export async function runRequisitionNow(id: string, deps: ChainDeps = chainDeps, requestedBy: string | null = null): Promise<StepOutcome> {
  return runNow(
    "requisition",
    id,
    async () => {
      const req = await deps.store.requisition(id);
      if (!req?.step || req.error || !(REQUISITION_ACTING as readonly string[]).includes(req.step)) return null;
      return requisitionRun(req, deps);
    },
    () => advanceRequisition(id, deps, { requestedBy }),
  );
}

// ── the two agents the hiring driver drives ────────────────────────────────

export const hiringApplicationDriven: DrivenAgent = {
  routineId: CHAIN_ROUTINE_ID,
  stepSeconds: STEP_SECONDS,
  shadow: true,
  dueRuns: () => dueApplicationRuns(),
  runStep: async (id) => tickResponse(await advanceApplication(id, chainDeps)),
  giveUp: async (id, _step, error) => {
    await chainDeps.store.setApplication(id, { error: error.slice(0, 500) });
  },
};

export const hiringRequisitionDriven: DrivenAgent = {
  routineId: CHAIN_ROUTINE_ID,
  stepSeconds: STEP_SECONDS,
  shadow: true,
  dueRuns: () => dueRequisitionRuns(),
  runStep: async (id) => tickResponse(await advanceRequisition(id, chainDeps)),
  giveUp: async (id, _step, error) => {
    await chainDeps.store.setRequisition(id, { error: error.slice(0, 500) });
  },
};
