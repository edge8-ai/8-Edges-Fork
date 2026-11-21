import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { Decider } from "@/kernel/approvals/versioned";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import type { BroadcastStatus } from "./broadcasts";

// The one place a broadcast's status is written (A.44, A.55). Every move, a
// person's or a routine's, reads the row, refuses a status outside its verb's
// `from`, runs the step that must come first, writes the new status on
// condition that the row is still where the verb moves it from, runs the step
// that must follow, and writes the audit row. A person's verbs, with their
// letter steps, are in ./broadcast-lifecycle; a routine's go through
// moveByRoutine below.
//
// This file imports nothing of the letter on purpose. The letter's own writes
// (lib/letter/data.ts) move the status through here, and the letter's send step
// imports them, so a module that held both the write and the letter's steps
// would import itself in a circle (import/no-cycle). The lint rail in
// eslint.config.mjs (BROADCAST_STATUS_WRITES) exempts this file and no other.

type Verb = "approve" | "cancel" | "delete" | "start" | "pause" | "missed" | "sent";

/** The row as the move found it: its status, and the series flag Approve reads. */
export type FoundBroadcast = { status: BroadcastStatus; series_id: string | null };

/**
 * Who moved it. A person's address goes on the audit row and a person's id on
 * the letter's approval; a routine is named by its id, and the letter's steps,
 * which answer to a person's press, never run for it.
 */
export type BroadcastActor = Decider | { routine: string };

type Transition = {
  /** The statuses this verb may move a broadcast from. */
  from: readonly BroadcastStatus[];
  /** The status it writes, from the row it found. Delete reads the status (a sent broadcast stays sent), Approve the series flag. */
  to: (found: FoundBroadcast) => BroadcastStatus;
  /** The sentence a refused status gets. */
  refusal: (found: BroadcastStatus) => string;
};

export const BROADCAST_TRANSITIONS: Record<Verb, Transition> = {
  // The approval gate: nothing reaches a recipient without it, or a letter's
  // own (Y.17). A series issue already has its send moment in scheduled_at, so
  // approving it is the go: it moves straight to sending and the send routine
  // waits for the moment.
  approve: {
    from: ["draft"],
    to: (found) => (found.series_id ? "sending" : "approved"),
    refusal: (found) => `Broadcast is already ${found}.`,
  },
  cancel: {
    from: ["draft", "approved"],
    to: () => "cancelled",
    refusal: (found) => (found === "sending" ? "The broadcast is sending: pause it before cancelling it." : `A ${found} broadcast cannot be cancelled.`),
  },
  // The soft delete: the row keeps its recipients and events and leaves every
  // list and the calendar. A sent broadcast stays sent, because it went out.
  delete: {
    from: ["draft", "approved", "cancelled", "missed", "sent"],
    to: (found) => (found.status === "sent" ? "sent" : "cancelled"),
    refusal: (found) => (found === "sending" ? "The broadcast is sending: pause it before deleting it." : `A ${found} broadcast cannot be deleted.`),
  },
  // Separate from approve so the send is a second, deliberate press: approving
  // says "this copy is right", starting says "go now". The letter's driver
  // releases a scheduled letter by the same move.
  start: {
    from: ["approved"],
    to: () => "sending",
    refusal: (found) => `A ${found} broadcast cannot start sending; only an approved one can.`,
  },
  // The send routine only works on a sending broadcast, so this stops the next
  // batch; Start sending resumes it where it left off.
  pause: {
    from: ["sending"],
    to: () => "approved",
    refusal: (found) => `A ${found} broadcast is not sending, so there is nothing to pause.`,
  },
  // The moment passed and it never went out. Not a cancellation, because
  // nobody decided against it.
  missed: {
    from: ["draft", "approved"],
    to: () => "missed",
    refusal: (found) => `A ${found} broadcast cannot be marked missed.`,
  },
  // The send routine's last move, once no recipient is pending or in flight.
  // No person's button offers it.
  sent: {
    from: ["sending"],
    to: () => "sent",
    refusal: (found) => `A ${found} broadcast is not sending, so it cannot be marked sent.`,
  },
};

export type MoveStep = {
  verb: Verb;
  /** Runs after the status check and before the write; a sentence refuses and nothing is written. */
  before?: (found: FoundBroadcast) => Promise<string | null>;
  /** Extra columns the write carries beside the status. */
  columns?: (now: string) => CompanyOsUpdate<"email_campaigns">;
  /** Runs after the write; a sentence is reported, but the write stands. */
  after?: () => Promise<string | null>;
  audit: (found: FoundBroadcast) => Record<string, unknown>;
};

type Moved = { ok: true; moved: boolean } | { ok: false; error: string };

const isRoutine = (by: BroadcastActor): by is { routine: string } => "routine" in by;

async function move(id: string, by: BroadcastActor, step: MoveStep): Promise<Moved> {
  // A person is told why nothing moved. A routine is not: whether the row was
  // never where this verb moves it from, or left it under the write, the
  // routine lost a race with a person or another tick and has nobody to tell,
  // so it answers moved: false, as its conditional writes always did.
  const stay = (why: string): Moved => (isRoutine(by) ? { ok: true, moved: false } : { ok: false, error: why });
  const rule = BROADCAST_TRANSITIONS[step.verb];
  const { data: row, error: readError } = await companyOs.from("email_campaigns").select("status, series_id").eq("id", id).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!row) return stay("Broadcast not found.");
  const found: FoundBroadcast = { status: row.status as BroadcastStatus, series_id: row.series_id ?? null };
  if (!rule.from.includes(found.status)) return stay(rule.refusal(found.status));

  const refused = step.before ? await step.before(found) : null;
  if (refused) return { ok: false, error: refused };

  // The write lands only while the row is still in a status this verb would
  // move to the same place. That is wider than the status read above on
  // purpose: withdrawing a letter frozen for its approval thaws it from
  // approved back to draft, and a cancel must still land on it. It is never
  // wider than `from`, so a broadcast that started sending in the meantime is
  // not touched, and a Delete that found a draft never archives a sent row.
  const to = rule.to(found);
  const still = rule.from.filter((status) => rule.to({ ...found, status }) === to);
  const now = new Date().toISOString();
  const { data: written, error } = await companyOs
    .from("email_campaigns")
    .update({ status: to, updated_at: now, ...step.columns?.(now) })
    .eq("id", id)
    .in("status", still)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Nothing matched: a Cancel, a second Approve or another tick moved the row
  // between the read and the write. Nothing after the write runs and no audit
  // row claims a move that did not happen.
  if (!written || written.length === 0) {
    return stay(`The broadcast moved on from ${found.status} while this ran, so its status was not changed. Reload to see where it is now.`);
  }

  const unclosed = step.after ? await step.after() : null;
  await recordAudit({
    table: "email_campaigns",
    recordId: id,
    operation: "update",
    actor: isRoutine(by) ? by.routine : by.email,
    context: step.audit(found),
  });
  return unclosed ? { ok: false, error: unclosed } : { ok: true, moved: true };
}

/** A person's move: every way it does not move is a sentence for that person. */
export async function moveBroadcast(id: string, by: Decider, step: MoveStep): Promise<Result> {
  const moved = await move(id, by, step);
  return moved.ok ? { ok: true } : moved;
}

type RoutineVerb = "start" | "cancel" | "sent";

// What a routine's move writes beside the status, and what its audit row
// says. No letter step runs: the driver releasing a scheduled letter is not a
// person's Start sending, and a letter cancelling itself has no approval left
// to withdraw.
const ROUTINE_STEPS: Record<RoutineVerb, Omit<MoveStep, "verb">> = {
  start: { audit: () => ({ sending: true, released: true }) },
  cancel: { audit: (found) => ({ cancelled: true, from: found.status }) },
  sent: { columns: (now) => ({ sent_at: now }), audit: () => ({ sent: true }) },
};

/**
 * A routine's move: the letter's driver releasing (start) or cancelling a
 * letter, and the send routine marking a broadcast sent. Answers moved: false,
 * not an error, when the broadcast was not where the verb moves it from.
 */
export function moveByRoutine(id: string, routineId: string, verb: RoutineVerb): Promise<Moved> {
  return move(id, { routine: routineId }, { verb, ...ROUTINE_STEPS[verb] });
}
