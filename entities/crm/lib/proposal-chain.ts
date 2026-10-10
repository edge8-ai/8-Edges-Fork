import { routineSwitches } from "@/kernel/audit/routine-config";
import { currentRunMode, recordRoutineRun } from "@/kernel/audit/routine-runs";
import { stepTick, type DrivenAgent, type DrivenRun } from "@/kernel/audit/step-driver";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { notifyOps } from "@/kernel/messaging/lark";
import { PROPOSAL_MODEL, type ProposalModel } from "./proposal-ai";
import { withdrawProposal } from "./proposal-approval";
import { PROPOSAL_HOUSE } from "./proposal-pricing";
import { draftsAt, loadDraft, meetingsWithDrafts, moveDraft, openDraft, type DraftRow } from "./proposal-data";
import { ask, CHAIN, publish, publishKey, record } from "./proposal-outward";
import { draft, extract, gather, type StepOutcome } from "./proposal-steps";
import { DRIVEN_STEPS, isDrivenStep, OUTWARD_STEPS, PROPOSAL_ROUTINE_ID, type DrivenStep, type ProposalStep } from "./proposal-types";

// The call-to-proposal chain (Z.10, R2) as a tick-driven run (ADR 0015). The
// step lives on the run's own row (proposal_drafts.step); the crm driver cron
// advances every due run by exactly one step per tick through the kernel's
// driveAgents, recorded under PROPOSAL_ROUTINE_ID with the tick
// `<draft id>:<started_at>:<step>`, so a step a person runs from a button and
// the driver's never both run. A failing step is backed off and, after three
// attempts, the run stops with the reason on the row, where Retry gives it a
// new epoch. This is the writer's run loop (entities/campaigns/lib/run-loop.ts)
// written for crm, which may not reach campaigns.
//
//   discovery → gather → extract → draft → ask → [ready] → publish → record → done
//                                   └ shadow: shadow-done      └ reject: rejected
//
// Shadow (decision 3, Z.17). A run's mode is set when it opens and kept: a
// shadow run drafts and stops at shadow-done, opening no approval, sending no
// DM, publishing nothing and offering no CRM change for anyone to apply. A run
// opens live only when the routine's switch on Settings -> Agents has been set
// to Live by a person; a routine with no switch row, which the kernel treats
// as live, opens shadow runs here, so the chain cannot go live by being
// deployed. The outward steps (ask, publish, record) never run in a shadow
// tick: the driver does not offer them, and a live run waits at its step
// until the switch is Live again.

/** Seconds one step may take: the driver cron's maxDuration (entities/crm/mounts.ts). */
export const PROPOSAL_STEP_SECONDS = 300;

/** Meetings created before this are never discovered (plan G3: no backfill). */
export const PROPOSAL_CHAIN_SINCE = "2026-10-10T00:00:00Z";

export type StepResult =
  | { ok: true; id: string; step: DrivenStep; next: ProposalStep; summary: string }
  | { ok: false; id: string; step: DrivenStep; error: string }
  | { skipped: string; id: string };

let model: ProposalModel = PROPOSAL_MODEL;
/** For tests: the model calls the steps make. */
export function useProposalModel(m: ProposalModel | null): void {
  model = m ?? PROPOSAL_MODEL;
}

function runStepFn(step: DrivenStep, row: DraftRow): Promise<StepOutcome> {
  switch (step) {
    case "gather":
      return gather(row);
    case "extract":
      return extract(row, model);
    case "draft":
      return draft(row, model);
    case "ask":
      return ask(row);
    case "publish":
      return publish(row);
    case "record":
      return record(row);
  }
}

/** Run the step the draft is at, and move it on from that step only. */
export async function advance(id: string): Promise<StepResult> {
  const row = await loadDraft(id);
  if (!row) return { skipped: "No such proposal.", id };
  if (!isDrivenStep(row.step)) return { skipped: `The run is at ${row.step}, not at a step.`, id };
  const step = row.step;
  if (OUTWARD_STEPS.includes(step) && (row.mode !== "live" || currentRunMode() === "shadow")) {
    return { ok: false, id, step, error: "The chain is in shadow, so this step waits until the switch on Settings → Agents is Live." };
  }
  try {
    const out = await runStepFn(step, row);
    const moved = await moveDraft(id, step, { ...(out.patch ?? {}), step: out.next, ...(out.next === "stopped" ? {} : { error: null }) });
    if (!moved) return { ok: false, id, step, error: "The run moved while this step ran; nothing more was done." };
    return { ok: true, id, step, next: out.next, summary: out.summary };
  } catch (err) {
    return { ok: false, id, step, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A step's HTTP shape, which the run recorder reads (Y.34): a failed step answers 422 and records as an error. */
function stepResponse(result: StepResult): Response {
  if ("skipped" in result) return Response.json({ ...result, error: `Nothing run: ${result.skipped}` }, { status: 409 });
  if (!result.ok) return Response.json(result, { status: 422 });
  return Response.json({ ...result, summary: `${result.step}: ${result.summary}` });
}

async function current(id: string): Promise<DrivenRun | null> {
  const row = await loadDraft(id);
  if (!row || !isDrivenStep(row.step)) return null;
  return { id: row.id, epoch: row.started_at, step: row.step };
}

/**
 * Run the step a draft is at now, from a person's button, under the step's own
 * tick. A step the driver is running already answers skipped.
 */
export async function runNow(id: string): Promise<StepResult> {
  const at = await current(id);
  if (!at) return { skipped: "The run is not at a step.", id };
  const holder: { result: StepResult | null } = { result: null };
  const res = await recordRoutineRun(
    PROPOSAL_ROUTINE_ID,
    async () => {
      holder.result = await advance(id);
      return stepResponse(holder.result);
    },
    "vercel",
    { tick: stepTick(at), stepSeconds: PROPOSAL_STEP_SECONDS, shadowCapable: true },
  );
  if (holder.result) return holder.result;
  let reason = "The step is already running.";
  try {
    const body = (await res.json()) as { reason?: string };
    if (body.reason && body.reason !== "tick-taken") reason = `Not run: ${body.reason}.`;
  } catch {
    // An unreadable answer keeps the tick-taken wording.
  }
  return { skipped: reason, id };
}

/**
 * The mode a new run opens in: live only when a person has set the switch to
 * Live, and never inside a shadow tick.
 */
export async function openingMode(): Promise<"live" | "shadow"> {
  if (currentRunMode() === "shadow") return "shadow";
  const switches = await routineSwitches();
  return switches.get(PROPOSAL_ROUTINE_ID)?.mode === "live" ? "live" : "shadow";
}

/**
 * The sales meetings due a draft: summarised, tied to a company, not archived,
 * created since go-live, marked Sales (by type or by their transcript's call
 * type), and without a draft. A failed read raises: "nothing to draft" must
 * never be what an outage says.
 */
type DueMeeting = { id: string; company_id: string; created_at: string };

export async function dueMeetings(since: string = PROPOSAL_CHAIN_SINCE): Promise<DueMeeting[]> {
  const base = () =>
    companyOs.from("meetings").select("id, company_id, created_at").eq("ai_status", "ready").not("company_id", "is", null).is("archived_at", null).gte("created_at", since);
  const [typed, calls] = await Promise.all([
    base().eq("meeting_type", "Sales"),
    companyOs.from("call_transcripts").select("meeting_id").eq("call_type", "sales").not("meeting_id", "is", null).gte("created_at", since),
  ]);
  const byType = mustRows(typed, "[crm/proposal] Sales meetings") as DueMeeting[];
  const callIds = (mustRows(calls, "[crm/proposal] sales calls") as { meeting_id: string }[]).map((c) => c.meeting_id).filter((id) => !byType.some((m) => m.id === id));
  const byCall = callIds.length ? (mustRows(await base().in("id", callIds), "[crm/proposal] sales-call meetings") as DueMeeting[]) : [];
  const meetings = [...byType, ...byCall];
  const drafted = await meetingsWithDrafts(meetings.map((m) => m.id));
  return meetings.filter((m) => !drafted.has(m.id));
}

/** Discovery, before the driver drives: one run per due meeting. Answers how many it opened. */
export async function discover(): Promise<number> {
  // A deployment without a proposal reference (every fork) drafts nothing:
  // each run would only stop at gather and alert Operations.
  if (!PROPOSAL_HOUSE) return 0;
  const due = await dueMeetings();
  if (due.length === 0) return 0;
  const mode = await openingMode();
  let opened = 0;
  for (const m of due) {
    const r = await openDraft({ companyId: m.company_id, meetingId: m.id, mode, requestedBy: null });
    if (r.opened) opened += 1;
  }
  return opened;
}

async function dueRuns(): Promise<DrivenRun[]> {
  // In a shadow tick the outward steps wait: a live run never asks or
  // publishes while the switch says shadow.
  const steps = currentRunMode() === "shadow" ? DRIVEN_STEPS.filter((s) => !OUTWARD_STEPS.includes(s)) : DRIVEN_STEPS;
  const rows = await draftsAt(steps);
  return rows.filter((r) => !(OUTWARD_STEPS as readonly string[]).includes(r.step) || r.mode === "live").map((r) => ({ id: r.id, epoch: r.started_at, step: r.step }));
}

/** Stop a run at `step` with `error` after its attempts ran out; Operations hears once. */
async function giveUp(id: string, step: string, error: string): Promise<void> {
  await withdrawProposal(id, CHAIN, "The run stopped.");
  const moved = await moveDraft(id, step as DrivenStep, { step: "stopped", error, finished_at: new Date().toISOString() });
  if (moved) await notifyOps(`The proposal chain stopped a run at ${step} after three attempts: ${error.slice(0, 300)}`);
}

/** The chain as the tick driver drives it. */
export const proposalDriven: DrivenAgent = {
  routineId: PROPOSAL_ROUTINE_ID,
  stepSeconds: PROPOSAL_STEP_SECONDS,
  shadow: true,
  dueRuns,
  runStep: async (id) => stepResponse(await advance(id)),
  giveUp,
};

/**
 * Draft a proposal for a meeting now (the meeting page's button): open the
 * run whatever the meeting's type, and run its first step inline.
 */
export async function startProposal(meetingId: string, companyId: string, requestedBy: string | null): Promise<{ id: string; opened: boolean; result: StepResult }> {
  if (!PROPOSAL_HOUSE) throw new Error("This deployment has no proposal reference, so it does not draft proposals.");
  const mode = await openingMode();
  const opened = await openDraft({ companyId, meetingId, mode, requestedBy });
  return { ...opened, result: await runNow(opened.id) };
}

/** Whether this run's page already went live: its own publish settled, or the row says so. */
async function alreadyPublished(row: DraftRow): Promise<boolean> {
  if (row.published_at) return true;
  if (!row.meeting_id) return false;
  const { data, error } = await companyOs.from("automation_effects").select("routine_id, status").eq("key", publishKey(row)).maybeSingle();
  if (error) throw new Error(`automation_effects: ${error.message}`);
  return (data as { routine_id: string; status: string } | null)?.status === "done";
}

/**
 * A run that stopped, was rejected or ended in shadow starts again under a new
 * epoch, in the switch's mode. A run whose page already went live is never
 * drafted again: its stop came after the publish, so Retry finishes it by
 * running record again, and the live page and its approval stay as they are.
 */
export async function restartProposal(id: string): Promise<{ ok: true; result: StepResult } | { ok: false; error: string }> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (!["stopped", "rejected", "shadow-done"].includes(row.step)) return { ok: false, error: `The run is at ${row.step}; only a stopped, rejected or shadow run starts again.` };
  if (row.step === "stopped" && (await alreadyPublished(row))) {
    const resumed = await moveDraft(id, "stopped", { step: "record", started_at: new Date().toISOString(), finished_at: null, error: null });
    if (!resumed) return { ok: false, error: "The run moved a moment ago. Reload to see where it is." };
    return { ok: true, result: await runNow(id) };
  }
  const mode = await openingMode();
  const moved = await moveDraft(id, row.step as ProposalStep, {
    step: "gather",
    mode,
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
    published_url: null,
    published_at: null,
  });
  if (!moved) return { ok: false, error: "The run moved a moment ago. Reload to see where it is." };
  return { ok: true, result: await runNow(id) };
}

/** Stop a run that has not finished: withdraw its approval and close it. */
export async function stopProposal(id: string, by: { personId: string | null; email: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await loadDraft(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  const open: ProposalStep[] = ["gather", "extract", "draft", "ask", "ready", "publish"];
  if (!open.includes(row.step as ProposalStep)) return { ok: false, error: `The run is at ${row.step} and cannot be stopped.` };
  const withdrawn = await withdrawProposal(id, by, `Stopped by ${by.email}.`);
  if (!withdrawn.ok) return withdrawn;
  const moved = await moveDraft(id, row.step as ProposalStep, { step: "stopped", error: `Stopped by ${by.email}.`, finished_at: new Date().toISOString() });
  return moved ? { ok: true } : { ok: false, error: "The run moved a moment ago. Reload to see where it is." };
}
