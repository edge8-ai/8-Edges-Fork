// The hiring chain's vocabulary (Z.9): its routine ids, its two state
// machines' steps, and the permission every approval waits on. Browser-safe
// and pure, so the pages and the server share one spelling; the step lists
// match the check constraints the Z.9 migration put on chain_step.

/** Where every step of the chain is recorded as a routine run, and the switch Settings -> Agents flips. */
export const CHAIN_ROUTINE_ID = "/api/cron/hiring-chain/";

/** The scheduled route that advances the chain by one step per tick. */
export const DRIVER_ROUTINE_ID = "/api/cron/hiring-driver/";

/** Whoever holds this decides every hiring approval (spec section 6). */
export const HIRING_APPROVER = "hiring.approve";

/** Seconds one step may take: the driver route's maxDuration. A resume screen is the longest. */
export const STEP_SECONDS = 300;

/** A requisition proposes a shortlist on its own once this many screened applications wait at triage. */
export const AUTO_SHORTLIST_AT = 5;

// The application machine (applications.chain_step).
export const APPLICATION_STEPS = [
  "screen",
  "triage",
  "draft-invite",
  "draft-decline",
  "message-ready",
  "send",
  "interviewing",
  "ask-decision",
  "decision-ready",
  "decide",
  "closed",
] as const;
export type ApplicationStep = (typeof APPLICATION_STEPS)[number];

/** The application steps the driver runs. The rest wait on a person or are finished. */
export const APPLICATION_ACTING = ["screen", "draft-invite", "draft-decline", "send", "ask-decision", "decide"] as const satisfies readonly ApplicationStep[];

/** The one application step that runs in shadow: the screen, which is advisory and runs on every application today. */
export const APPLICATION_SHADOW_SAFE: readonly ApplicationStep[] = ["screen"];

// The requisition machine (job_requisitions.chain_step).
export const REQUISITION_STEPS = [
  "ask-open",
  "open-ready",
  "open",
  "collecting",
  "shortlist",
  "shortlist-ready",
  "apply-shortlist",
  "closed",
] as const;
export type RequisitionStep = (typeof REQUISITION_STEPS)[number];

export const REQUISITION_ACTING = ["ask-open", "open", "shortlist", "apply-shortlist"] as const satisfies readonly RequisitionStep[];

/** The requisition steps that run in shadow: proposing a shortlist, which then opens nothing. */
export const REQUISITION_SHADOW_SAFE: readonly RequisitionStep[] = ["collecting", "shortlist"];

export function isApplicationStep(v: unknown): v is ApplicationStep {
  return typeof v === "string" && (APPLICATION_STEPS as readonly string[]).includes(v);
}

export function isRequisitionStep(v: unknown): v is RequisitionStep {
  return typeof v === "string" && (REQUISITION_STEPS as readonly string[]).includes(v);
}

/** The steps a recruiter may propose a decision from: the waits where nothing else is pending. */
export const PROPOSABLE_FROM: readonly ApplicationStep[] = ["triage", "interviewing"];

export type Lane = "advance" | "decline" | "hold";

export type MessageKind = "invite" | "decline" | "decision_hire" | "decision_reject";
export type DecisionOutcome = "hired" | "rejected";

/** The send key a message is claimed and sent under (spec section 7). */
export function sendKey(applicationId: string, kind: MessageKind, stageId: string | null): string {
  if (kind === "invite") return `hiring:msg:${applicationId}:invite:${stageId ?? "none"}`;
  if (kind === "decline") return `hiring:msg:${applicationId}:decline`;
  return `hiring:msg:${applicationId}:decision`;
}

/** What one application step means, for the page's chain line. */
export function describeApplicationStep(step: string | null): string {
  switch (step) {
    case "screen":
      return "the AI screen is running";
    case "triage":
      return "waiting for the requisition's shortlist";
    case "draft-invite":
      return "drafting an interview invitation";
    case "draft-decline":
      return "drafting a decline";
    case "message-ready":
      return "a message waits on its approval";
    case "send":
      return "sending the approved message";
    case "interviewing":
      return "interviewing";
    case "ask-decision":
      return "asking for the decision's approval";
    case "decision-ready":
      return "a decision waits on its approval";
    case "decide":
      return "recording the approved decision";
    case "closed":
      return "finished";
    default:
      return "not in the chain";
  }
}
