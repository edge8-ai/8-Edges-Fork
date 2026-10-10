import { companyOs, type Json } from "@/kernel/data/supabase";
import { parseBroadcastBlocks, type BroadcastBlocks } from "../marketing-email-blocks";
import type { SendWindow } from "../send-window";
import { stampSendWindow } from "../send-window-stamp";
import type { LetterState } from "./steps";
import { LETTER_ACTOR } from "./types";

// The letter agent's reads and writes, in one file so the steps stay pure
// functions over data. Every Supabase call checks `error` before `data`.

export type DataPoint = { date: string; fact: string; source: string };

// What the steps hand each other between ticks, stored on agent_notes.
export type LetterNotes = {
  gathered?: DataPoint[];
  gatheredAt?: string;
  picked?: { id: string; title: string; pillar: string | null }[];
  checklist?: string[];
  testSentTo?: string;
};

export type Letter = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  bodyMd: string;
  blocks: BroadcastBlocks;
  brandId: string | null;
  status: string;
  fromEmail: string | null;
  replyTo: string | null;
  agentStep: string | null;
  agentError: string | null;
  agentStartedAt: string | null;
  // The send's due time once the letter is approved (Y.17): the first
  // recipient's moment in the send window.
  scheduledAt: string | null;
  notes: LetterNotes;
};

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadLetter(id: string): Promise<Loaded<Letter>> {
  const { data, error } = await companyOs.from("email_campaigns").select("id, name, subject, preheader, body_md, blocks, brand_id, status, from_email, reply_to, agent_step, agent_error, agent_started_at, agent_notes, scheduled_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Broadcast not found." };
  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      subject: data.subject,
      preheader: data.preheader,
      bodyMd: data.body_md,
      blocks: parseBroadcastBlocks(data.blocks),
      brandId: data.brand_id,
      status: data.status,
      fromEmail: data.from_email,
      replyTo: data.reply_to,
      agentStep: data.agent_step,
      agentError: data.agent_error,
      agentStartedAt: data.agent_started_at,
      scheduledAt: data.scheduled_at,
      notes: (data.agent_notes && typeof data.agent_notes === "object" ? data.agent_notes : {}) as LetterNotes,
    },
  };
}

export async function setAgentState(
  id: string,
  state: { step: LetterState | null; error: string | null; startedAt?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fields: { agent_step: string | null; agent_error: string | null; agent_started_at?: string | null } = {
    agent_step: state.step,
    agent_error: state.error,
  };
  if (state.startedAt !== undefined) fields.agent_started_at = state.startedAt;
  const { error } = await companyOs.from("email_campaigns").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Merges into agent_notes so each step keeps what the earlier ones learned.
export async function saveNotes(letter: Letter, patch: LetterNotes): Promise<{ ok: true } | { ok: false; error: string }> {
  const notes = { ...letter.notes, ...patch } as Json;
  const { error } = await companyOs.from("email_campaigns").update({ agent_notes: notes }).eq("id", letter.id);
  if (error) return { ok: false, error: error.message };
  letter.notes = notes as LetterNotes;
  return { ok: true };
}

export async function updateLetter(
  id: string,
  fields: Partial<{ subject: string; preheader: string; body_md: string; blocks: BroadcastBlocks }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs.from("email_campaigns").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The most recent letters that went out or are about to, newest first: what
// the template and CTA rotation read. Only the letter agent's own broadcasts
// count, so a hand-made broadcast (which carries the default cards layout)
// cannot reset the rotation.
export async function recentSentLetters(limit = 6): Promise<{ subject: string; blocks: BroadcastBlocks; createdAt: string }[]> {
  const { data, error } = await companyOs.from("email_campaigns").select("subject, blocks, created_at")
    .in("status", ["approved", "sending", "sent"])
    .eq("created_by", LETTER_ACTOR)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[letter] recent letters read failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ subject: r.subject, blocks: parseBroadcastBlocks(r.blocks), createdAt: r.created_at }));
}

// The recipients still to be mailed: what an approval to send names.
export async function pendingRecipientCount(id: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { count, error } = await companyOs.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

// Writes the send window onto the broadcast's segment, so the approver reads
// the window the send will use and the approval stamps it.
export async function pinSendWindow(id: string, segment: Record<string, unknown>, window: SendWindow): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ segment: { ...segment, sendWindow: window } as Json, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Freeze the letter's copy before its approval is decided (Y.17 review): draft
 * -> approved, in one conditional statement, so no edit can land between the
 * version the approver read and the decision (updateBroadcast refuses a
 * broadcast that is not a draft). A letter already approved (a resume after a
 * failed write) is already frozen. Answers whether this call froze it, so a
 * caller whose decision then fails can thaw only what it froze.
 */
export async function lockLetterCopy(id: string, approvedBy: string): Promise<{ ok: true; locked: boolean } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await companyOs
    .from("email_campaigns")
    .update({ status: "approved", approved_at: now, approved_by: approvedBy, updated_at: now })
    .eq("id", id)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (data && data.length > 0) return { ok: true, locked: true };
  const { data: row, error: readError } = await companyOs.from("email_campaigns").select("status").eq("id", id).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (row?.status === "approved") return { ok: true, locked: false };
  return { ok: false, error: `The broadcast is ${row?.status ?? "missing"}; nothing was approved.` };
}

/** Thaw a letter this call froze when its approval was not decided after all. */
export async function unlockLetterCopy(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ status: "draft", approved_at: null, approved_by: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * The approved letter's schedule (Y.17), restored from the scheduleLetter that
 * Y.66 removed, without its approve and its last move: each pending recipient
 * is stamped with the next window moment in their own zone counted from this
 * approval, and scheduled_at is the first of those moments, the send's due
 * time. The broadcast stays approved, not sending: the letter's send step
 * releases it once that time comes and the approval still stands. Re-runnable,
 * for a resume after a failed write.
 */
export async function stampLetterSend(id: string, window: SendWindow): Promise<{ ok: true; firstSendAt: string | null; recipients: number } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const stamped = await stampSendWindow(id, window);
  if (!stamped.ok) return { ok: false, error: `the send times could not be stamped: ${stamped.error}` };

  const { data: first, error: firstError } = await companyOs
    .from("email_campaign_recipients")
    .select("send_after")
    .eq("campaign_id", id)
    .eq("status", "pending")
    .order("send_after", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstError) return { ok: false, error: firstError.message };
  const firstSendAt = first?.send_after ?? now;

  // agent_step and the due time in one write, so a run never reads scheduled
  // without the time it is due.
  const { error: dueError } = await companyOs.from("email_campaigns").update({ scheduled_at: firstSendAt, agent_step: "scheduled", agent_error: null, updated_at: now }).eq("id", id);
  if (dueError) return { ok: false, error: dueError.message };
  return { ok: true, firstSendAt, recipients: stamped.summary.stamped };
}

/**
 * The send's claim: approved -> sending, in one conditional statement, so of
 * two ticks or a tick and a person's Start sending only one moves it. The send
 * routine mails each recipient at their stamped moment, each email under its
 * own Resend idempotency key. Answers the status the broadcast has after the
 * attempt, so a caller that lost the race can say why.
 */
export async function releaseLetter(id: string): Promise<{ ok: true; released: boolean; status: string } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data, error } = await companyOs
    .from("email_campaigns")
    .update({ status: "sending", updated_at: now })
    .eq("id", id)
    .eq("status", "approved")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (data && data.length > 0) return { ok: true, released: true, status: "sending" };
  const { data: row, error: readError } = await companyOs.from("email_campaigns").select("status").eq("id", id).maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  return { ok: true, released: false, status: row?.status ?? "missing" };
}

// A scheduled letter a person started or paused by hand: the run is past its
// send, so the driver never releases it again (a pause puts the broadcast back
// to approved, which the send step would otherwise read as not yet sent).
export async function markLetterReleased(id: string): Promise<{ ok: true; marked: boolean } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("email_campaigns").update({ agent_step: "released" }).eq("id", id).eq("agent_step", "scheduled").select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, marked: Boolean(data && data.length > 0) };
}

// A letter the approver rejected never sends: the broadcast is cancelled, so
// the weekly routine opens the next one on its day.
export async function cancelLetterBroadcast(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("email_campaigns")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "approved"]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
