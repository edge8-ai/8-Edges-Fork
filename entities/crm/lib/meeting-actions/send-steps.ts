import { openApproval } from "@/kernel/approvals/requests";
import { latestApproval } from "@/kernel/approvals/waiting";
import { once } from "@/kernel/audit/effects";
import { parkRun } from "@/kernel/audit/parked-runs";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { followupHtml } from "./checks";
import { claimSend, releaseSend, updateRunAt, type FollowupRun } from "./data";
import { chainItems, type ChainItem } from "./items";
import { recipientEmails, senderFor } from "./people";
import { companyContacts, loadChainMeeting, peopleByIds, sentEmailLogged } from "./sources";
import { approvalTick, closeGone, fail, followupKey, inShadow, meetingGone, MEETING_FOLLOWUP, moved, ok, readyDmKey, type Result } from "./step-kit";
import { FOLLOWUP_APPROVER_ATOM, IF_NOBODY_DECIDES, MEETING_ACTIONS_ROUTINE_ID } from "./steps";
import { followupVersion } from "./version";

// Resend remembers an Idempotency-Key for 24 hours; a resend after that could
// send a second email, so a reclaimed send is resent only inside this window.
const RESEND_SAFE_MS = 23 * 60 * 60 * 1000;

// The meeting-to-actions run's last two steps (Z.13, spec sections 3 and 6):
// ask opens the approval, parks the run and tells the approver once; send
// sends the version that was approved, once, from the approver's address.

// ── ask ──────────────────────────────────────────────────────────────────────

function cardCount(items: ChainItem[]): number {
  return items.filter((i) => i.fileState === "to_file" || i.fileState === "filed" || i.fileState === "needs_board").length;
}

/**
 * Open the approval for the run as it is now and park on it. Idempotent: a
 * pending approval is refreshed rather than doubled, the waiting row is one
 * per version, and the approver's DM goes once per meeting.
 */
export async function ask(run: FollowupRun): Promise<Result> {
  if (inShadow(run)) {
    // A live run that meets a shadow tick here would otherwise ask a person
    // about a send the chain is not allowed to make.
    if (!(await updateRunAt(run.id, "ask", { step: "shadowed" }))) return moved(run, "ask");
    return ok(run, "ask", "shadowed", "The chain is in shadow: nothing was asked or sent.");
  }
  const meeting = await loadChainMeeting(run.meetingId);
  const gone = meetingGone(meeting);
  if (gone || !meeting) return closeGone(run, "ask", gone ?? "The meeting is gone.");
  if (!run.version || !run.subject || !run.bodyMd) return fail(run, "ask", "There is no draft to ask about.");
  const items = await chainItems(run.meetingId);
  const tick = approvalTick(run, run.version);
  const company = meeting.companyName ?? "the client";
  const approver = run.approverPersonId ? { approverPersonId: run.approverPersonId } : { approverPermission: FOLLOWUP_APPROVER_ATOM };
  const opened = await openApproval({
    subjectType: MEETING_FOLLOWUP,
    subjectId: run.id,
    ...approver,
    requestedBy: null,
    label: `Send the follow-up to ${company}`,
    metadata: {
      version: run.version,
      recipients: run.toPersonIds.length,
      reach: "The client's contacts named on it, by email from the approver",
      meetingId: run.meetingId,
      companyName: company,
      meetingDate: meeting.meetingDate,
      cardsFiled: cardCount(items),
      run: tick,
      subject: run.subject,
      ifNobodyDecides: IF_NOBODY_DECIDES,
    },
  });
  if (!opened.ok) return fail(run, "ask", `The approval could not be opened: ${opened.error}`);
  const parked = await parkRun(MEETING_ACTIONS_ROUTINE_ID, tick, `Waiting on approval of version ${run.version} to ${run.toPersonIds.length} people at ${company}.`);
  if (!parked.ok) console.error(`[meeting-actions] ${run.id}: approval opened but the wait was not recorded: ${parked.error}`);
  if (!(await updateRunAt(run.id, "ask", { step: "ready" }))) return moved(run, "ask");
  await tellApprover(run, company);
  return ok(run, "ask", "ready", `Asked ${run.approverPersonId ? "the meeting's owner" : "whoever holds crm.calls"} to approve version ${run.version}.`);
}

/** One Lark DM to the approver, once per meeting, through the effect ledger. */
async function tellApprover(run: FollowupRun, company: string): Promise<void> {
  if (!run.approverPersonId) return;
  const [approver] = await peopleByIds([run.approverPersonId]);
  if (!approver?.email) return;
  const email = approver.email;
  const link = `${await getSiteOrigin()}/team/revenue/meetings/${run.meetingId}`;
  const result = await once(
    readyDmKey(run.meetingId),
    "lark",
    async () => {
      const sent = await sendLarkDm(email, `The follow-up to ${company} after your meeting is drafted and waits on your approval. Nothing is sent until you approve it.\n${link}`, { category: "client" });
      return sent ? { ok: true } : { ok: false, error: "the DM was not delivered" };
    },
    { summary: `Lark DM to the meeting's owner: the follow-up to ${company} waits on approval` },
  );
  if (result.acted && !result.outcome.ok) console.error(`[meeting-actions] ${run.id}: the approver's DM failed: ${result.outcome.error}`);
}

// ── send ─────────────────────────────────────────────────────────────────────

/**
 * Send the approved version, once. The latest approval must be approved for
 * the version the row holds, and the row's content must still hash to it
 * (a contact's address changed in the CRM is a different email): otherwise
 * the run goes back to ask, and nothing is sent.
 */
export async function send(run: FollowupRun): Promise<Result> {
  if (inShadow(run)) return fail(run, "send", "The chain is in shadow, so the approved follow-up is held; it sends on a live tick.");
  const meeting = await loadChainMeeting(run.meetingId);
  const gone = meetingGone(meeting);
  if (gone || !meeting) return closeGone(run, "send", gone ?? "The meeting is gone.");
  if (run.sentAt) {
    if (!(await updateRunAt(run.id, "send", { step: "sent" }))) return moved(run, "send");
    return ok(run, "send", "sent", "Already sent.");
  }
  const [latest, contacts, approverRows] = await Promise.all([
    latestApproval(MEETING_FOLLOWUP, run.id),
    companyContacts(meeting.companyId as string),
    run.approverPersonId ? peopleByIds([run.approverPersonId]) : Promise.resolve([]),
  ]);
  const { emails, missing } = recipientEmails(run.toPersonIds, contacts);
  const approverEmail = approverRows[0]?.email ?? null;
  const { from } = senderFor(approverEmail);
  const current = followupVersion({ from, to: emails, subject: run.subject ?? "", bodyMd: run.bodyMd ?? "" });
  const approvedVersion = latest?.state === "approved" && typeof latest.metadata.version === "string" ? latest.metadata.version : null;
  if (approvedVersion === null || approvedVersion !== run.version || current !== run.version || missing.length > 0 || emails.length === 0) {
    // A new start time: this start's ask tick already passed, and a passed tick never runs again.
    if (!(await updateRunAt(run.id, "send", { step: "ask", version: current, started_at: new Date().toISOString() }))) return moved(run, "send");
    return ok(run, "send", "ask", "The approval does not cover what would go out now; it is asked for again and nothing was sent.");
  }
  // The decider's address answers replies when the approval waited on a permission.
  const decidedBy = typeof latest?.metadata.approvedBy === "string" ? latest.metadata.approvedBy : null;
  const replyTo = approverEmail ?? decidedBy;

  const claim = await claimSend(run.id);
  if (claim.state === "sent") {
    if (!(await updateRunAt(run.id, "send", { step: "sent" }))) return moved(run, "send");
    return ok(run, "send", "sent", "Already sent.");
  }
  if (claim.state === "reclaimed") {
    // An earlier attempt claimed the send and never recorded how it ended.
    // The CRM's log says whether the email went; if it did, record it and
    // send nothing. If it is not there, a resend under the same key is safe
    // only while Resend still remembers the key (24 hours): past about 23,
    // the run stops for a person to look rather than risk a second email.
    if (await sentEmailLogged(run.meetingId, followupKey(run.meetingId))) {
      if (!(await updateRunAt(run.id, "send", { step: "sent", sent_at: new Date().toISOString() }))) return moved(run, "send");
      return ok(run, "send", "sent", "The email had already gone (it is on the CRM timeline); recorded it and sent nothing.");
    }
    if (Date.now() - new Date(claim.claimedAt).getTime() > RESEND_SAFE_MS) {
      const error = `The follow-up may have gone: a send was started at ${claim.claimedAt} and never recorded, and the provider no longer remembers it. Check the contacts' timelines and the sender's sent mail before resending; Retry sends it again.`;
      if (!(await updateRunAt(run.id, "send", { step: "stopped", error }))) return moved(run, "send");
      return ok(run, "send", "stopped", error);
    }
  }
  let accepted = false;
  try {
    accepted = await sendTransactionalEmail({
      to: emails,
      subject: run.subject as string,
      html: followupHtml(run.bodyMd as string),
      ...(from ? { from } : {}),
      ...(replyTo ? { replyTo } : {}),
      idempotencyKey: followupKey(run.meetingId),
      logMeta: { source: "meeting-followup", meeting_id: run.meetingId, version: run.version },
    });
  } catch (err) {
    accepted = false;
    console.error(`[meeting-actions] ${run.id}: the send threw:`, err instanceof Error ? err.message : err);
  }
  if (!accepted) {
    await releaseSend(run.id);
    return fail(run, "send", "The email was not accepted by the provider; it is tried again on a later tick under the same key.");
  }
  if (!(await updateRunAt(run.id, "send", { step: "sent", sent_at: new Date().toISOString() }))) {
    return fail(run, "send", "The email went, but the run did not record it; the next attempt re-sends under the same key, which sends nothing twice.");
  }
  return ok(run, "send", "sent", `Sent version ${run.version} to ${emails.length} people${claim.state === "reclaimed" ? " (a re-send under the same key)" : ""}.`);
}
