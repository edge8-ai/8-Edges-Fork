// The meeting-to-actions chain's words (Z.13, Automation Plan R5). Browser-safe
// and pure, so the meeting page's panel and the run share one spelling of each
// step. The run lives on company_os.meeting_followups, one row per client
// meeting; its `step` column is the state (ADR 0015), and the crm driver
// (crons/crm-driver.ts) advances every run at a step by one step per tick.
//
//   gather -> extract -> draft -> ask -> ready (waits on a person) -> send -> sent
//
// A shadow run closes `shadowed` after the draft: it never asks or sends. A
// Team Ceremony meeting files its cards and closes after extract, because a
// recurring ceremony would mail the client every week (decision 2).

/** Where each step is recorded as a routine run (Settings -> Agents). Its switch is the chain's. */
export const MEETING_ACTIONS_ROUTINE_ID = "/api/cron/meeting-actions/";

/** The steps the driver advances, in order. */
export const FOLLOWUP_STEPS = ["gather", "extract", "draft", "ask", "send"] as const;
export type FollowupStep = (typeof FOLLOWUP_STEPS)[number];

/** Every value meeting_followups.step may hold. */
export const FOLLOWUP_STATES = [...FOLLOWUP_STEPS, "ready", "sent", "rejected", "expired", "shadowed", "skipped", "stopped"] as const;
export type FollowupState = (typeof FOLLOWUP_STATES)[number];

export function isFollowupStep(value: string | null | undefined): value is FollowupStep {
  return (FOLLOWUP_STEPS as readonly string[]).includes(value ?? "");
}

export function isFollowupState(value: string | null | undefined): value is FollowupState {
  return (FOLLOWUP_STATES as readonly string[]).includes(value ?? "");
}

/** An undecided draft expires unsent after this many days (decision 8). */
export const EXPIRE_AFTER_DAYS = 7;

/**
 * Meetings written before this moment never open a run from the tick (no
 * backfill, decision 3). The button on the meeting page opens one for any
 * meeting.
 */
export const CHAIN_START = "2026-10-09T00:00:00.000Z";

/** How many ready meetings one tick opens runs for. */
export const OPEN_PER_TICK = 5;

/** The meeting type whose meetings get cards but no follow-up email (decision 2). */
export const CARDS_ONLY_TYPE = "Team Ceremony";

/** The skip reason a Team Ceremony run closes with once its cards are on their way. */
export const CARDS_ONLY_REASON = "Cards only: a Team Ceremony meeting gets no follow-up email.";

/** What an undecided draft does, as the approvals inbox says it. */
export const IF_NOBODY_DECIDES = `It waits, then expires unsent after ${EXPIRE_AFTER_DAYS} days. Nothing is sent on a timeout.`;

/** The atom whose holders run client meetings, and so approve a follow-up when no owner resolves (decision 4). */
export const FOLLOWUP_APPROVER_ATOM = "crm.calls";

const LABELS: Record<FollowupState, string> = {
  gather: "Gathering the meeting",
  extract: "Finding the actions",
  draft: "Drafting the follow-up",
  ask: "Asking for approval",
  ready: "Waiting on approval",
  send: "Sending",
  sent: "Sent",
  rejected: "Rejected, nothing sent",
  expired: "Expired unsent",
  shadowed: "Shadow: nothing filed or sent",
  skipped: "Closed",
  stopped: "Stopped",
};

export function describeFollowupState(state: FollowupState): string {
  return LABELS[state];
}
