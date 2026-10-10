import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";
import { mustRows } from "@/kernel/data/read";
import { isFollowupState, type FollowupState } from "./steps";

// The run's own row, company_os.meeting_followups (Z.13), which crm owns.
// With ./sources (the meeting and its people) and ./items (the chain's action
// items) this is every read and write the meeting-to-actions chain makes: the
// steps, the actions and the driver go through these three and nothing else,
// so the chain's tests replace them with an in-memory store. A failed read
// throws (rule 2): "no run" would open a second one.

export type RunMode = "live" | "shadow";

export type FollowupRun = {
  id: string;
  meetingId: string;
  mode: RunMode;
  step: FollowupState;
  startedAt: string;
  error: string | null;
  skipReason: string | null;
  transcriptSha256: string | null;
  contactIds: string[];
  commitments: string[];
  aiSubject: string | null;
  aiBodyMd: string | null;
  subject: string | null;
  bodyMd: string | null;
  toPersonIds: string[];
  version: string | null;
  approverPersonId: string | null;
  shadowVerdict: "would_send" | "would_not" | null;
  sendClaimedAt: string | null;
  sentAt: string | null;
  updatedAt: string;
};

const RUN_COLUMNS =
  "id, meeting_id, mode, step, started_at, error, skip_reason, transcript_sha256, contact_ids, commitments, ai_subject, ai_body_md, subject, body_md, to_person_ids, version, approver_person_id, shadow_verdict, send_claimed_at, sent_at, updated_at";

type RunRow = {
  id: string;
  meeting_id: string;
  mode: string;
  step: string;
  started_at: string;
  error: string | null;
  skip_reason: string | null;
  transcript_sha256: string | null;
  contact_ids: string[] | null;
  commitments: string[] | null;
  ai_subject: string | null;
  ai_body_md: string | null;
  subject: string | null;
  body_md: string | null;
  to_person_ids: string[] | null;
  version: string | null;
  approver_person_id: string | null;
  shadow_verdict: string | null;
  send_claimed_at: string | null;
  sent_at: string | null;
  updated_at: string;
};

function toRun(r: RunRow): FollowupRun {
  if (!isFollowupState(r.step)) throw new Error(`meeting_followups ${r.id}: unknown step ${r.step}`);
  return {
    id: r.id,
    meetingId: r.meeting_id,
    mode: r.mode === "shadow" ? "shadow" : "live",
    step: r.step,
    startedAt: r.started_at,
    error: r.error,
    skipReason: r.skip_reason,
    transcriptSha256: r.transcript_sha256,
    contactIds: r.contact_ids ?? [],
    commitments: r.commitments ?? [],
    aiSubject: r.ai_subject,
    aiBodyMd: r.ai_body_md,
    subject: r.subject,
    bodyMd: r.body_md,
    toPersonIds: r.to_person_ids ?? [],
    version: r.version,
    approverPersonId: r.approver_person_id,
    shadowVerdict: r.shadow_verdict === "would_send" || r.shadow_verdict === "would_not" ? r.shadow_verdict : null,
    sendClaimedAt: r.send_claimed_at,
    sentAt: r.sent_at,
    updatedAt: r.updated_at,
  };
}

export async function loadRun(id: string): Promise<FollowupRun | null> {
  const rows = mustRows(await companyOs.from("meeting_followups").select(RUN_COLUMNS).eq("id", id).limit(1), "[meeting-actions] run") as RunRow[];
  return rows[0] ? toRun(rows[0]) : null;
}

export async function loadRunForMeeting(meetingId: string): Promise<FollowupRun | null> {
  const rows = mustRows(await companyOs.from("meeting_followups").select(RUN_COLUMNS).eq("meeting_id", meetingId).limit(1), "[meeting-actions] run for meeting") as RunRow[];
  return rows[0] ? toRun(rows[0]) : null;
}

/**
 * Open the meeting's run, unless one exists: the unique meeting_id is the
 * claim, so two ticks, or a tick and a button, never open two. Answers the
 * run either way and whether this call opened it.
 */
export async function openRun(meetingId: string, mode: RunMode): Promise<{ run: FollowupRun; opened: boolean }> {
  const inserted = mustRows(
    await companyOs
      .from("meeting_followups")
      .upsert({ meeting_id: meetingId, mode, step: "gather" }, { onConflict: "meeting_id", ignoreDuplicates: true })
      .select(RUN_COLUMNS),
    "[meeting-actions] open run",
  ) as RunRow[];
  if (inserted[0]) return { run: toRun(inserted[0]), opened: true };
  const existing = await loadRunForMeeting(meetingId);
  if (!existing) throw new Error(`[meeting-actions] the run for ${meetingId} neither opened nor exists`);
  return { run: existing, opened: false };
}

export type RunPatch = TablesUpdate<{ schema: "company_os" }, "meeting_followups">;

/**
 * Write to a run only while it is still at `from`, so a person's click and the
 * driver's tick never both move it. Answers whether the write landed.
 */
export async function updateRunAt(id: string, from: FollowupState | FollowupState[], patch: RunPatch): Promise<boolean> {
  const at = Array.isArray(from) ? from : [from];
  const { data, error } = await companyOs.from("meeting_followups").update(patch).eq("id", id).in("step", at).select("id");
  if (error) throw new Error(`[meeting-actions] update run: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Every run at a step the driver advances, for the tick. */
export async function dueRuns(): Promise<{ id: string; epoch: string; step: string }[]> {
  const rows = mustRows(
    await companyOs.from("meeting_followups").select("id, started_at, step").in("step", ["gather", "extract", "draft", "ask", "send"]).order("created_at").limit(50),
    "[meeting-actions] due runs",
  ) as { id: string; started_at: string; step: string }[];
  return rows.map((r) => ({ id: r.id, epoch: r.started_at, step: r.step }));
}

/** Runs waiting on approval since before `before`: the expiry sweep's list. */
export async function readyRunsSince(before: string): Promise<FollowupRun[]> {
  const rows = mustRows(
    await companyOs.from("meeting_followups").select(RUN_COLUMNS).eq("step", "ready").lt("updated_at", before).limit(50),
    "[meeting-actions] ready runs",
  ) as RunRow[];
  return rows.map(toRun);
}

/**
 * Claim the send: set before the email goes. Answers "claimed" for a fresh
 * claim, "sent" when it already went, and "reclaimed", with when, when a
 * claim from an attempt that never finished is already there: the email may
 * have gone, and the send step decides from the CRM's log and the claim's age
 * whether a resend under the same Idempotency-Key is safe.
 */
export type SendClaim = { state: "claimed" | "sent" } | { state: "reclaimed"; claimedAt: string };

export async function claimSend(id: string): Promise<SendClaim> {
  const { data, error } = await companyOs
    .from("meeting_followups")
    .update({ send_claimed_at: new Date().toISOString() })
    .eq("id", id)
    .is("sent_at", null)
    .is("send_claimed_at", null)
    .select("id");
  if (error) throw new Error(`[meeting-actions] claim send: ${error.message}`);
  if ((data ?? []).length > 0) return { state: "claimed" };
  const run = await loadRun(id);
  if (!run) throw new Error(`[meeting-actions] the run ${id} is gone`);
  if (run.sentAt) return { state: "sent" };
  return { state: "reclaimed", claimedAt: run.sendClaimedAt ?? new Date().toISOString() };
}

/** Hand a failed send's claim back, so the retry sends again (under the same key). */
export async function releaseSend(id: string): Promise<void> {
  const { error } = await companyOs.from("meeting_followups").update({ send_claimed_at: null }).eq("id", id).is("sent_at", null);
  if (error) console.error(`[meeting-actions] ${id}: the send claim was not released: ${error.message}`);
}
