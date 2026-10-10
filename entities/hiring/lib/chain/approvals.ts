import type { ApprovalSubject } from "@/kernel/approvals/vocabulary";
import type { Result } from "@/kernel/data/result";
import { askDecision, askMessage, askRequisition, askShortlist, decisionSubject, withdrawAsk } from "./ask";
import { closeApplicationRun, decisionInFlight } from "./close-run";
import { PROPOSABLE_FROM, sendKey, type DecisionOutcome, type Lane } from "./steps";
import { BODY_MAX, SUBJECT_MAX } from "./templates";
import type { ChainApplication, ChainDeps, ChainRequisition, Proposal, Shortlist } from "./types";
import { decisionVersion, messageVersion, requisitionVersion, shortlistVersion, waitTick } from "./versions";

// What the approver and the recruiter do to the chain (spec section 3c), in
// the shape of the writer's publish approval (entities/campaigns/lib/writer/
// publish-approval.ts). Nothing here guards: the server actions that call it
// require hiring.approve or hiring.ats first, inline (ADR 0007).
//
// Approve binds the decision to the approval row and the version the page
// showed: if the content changed since, or the pending approval is for another
// version, it withdraws that approval, asks again for the content as it is and
// tells the approver to read it again; otherwise only the call whose decision
// lands moves the run on. Each answer says which row's step to run next, and
// the action runs it at once so the person sees it move.

export type Actor = { personId: string | null; email: string };
export type Next = { application?: string; requisition?: string };
export type ActionResult = { ok: true; next?: Next; notice?: string } | { ok: false; error: string };

const CHANGED = "It changed since this page was loaded, so it has been asked for again. Read it again, then approve.";
const NOT_WAITING = "Nothing here waits on an approval any more; the page may be out of date.";
const LOST = "Someone else decided it first. The page now shows what they decided.";

type Bound = { ok: true; approvalId: string; requestedBy: string | null } | { ok: false; error: string };

/** The pending approval, if it is for exactly the version the page showed and the content as it is now. */
async function bind(deps: ChainDeps, subject: ApprovalSubject, subjectId: string, current: string, seen: string, askAgain: () => Promise<Result>): Promise<Bound> {
  const latest = await deps.approvals.latest(subject, subjectId);
  if (!latest || latest.state !== "pending") return { ok: false, error: NOT_WAITING };
  if (seen !== current || latest.metadata.version !== current) {
    const again = await askAgain();
    return { ok: false, error: again.ok ? CHANGED : `${CHANGED} (Asking again failed: ${again.error})` };
  }
  return { ok: true, approvalId: latest.id, requestedBy: latest.requestedBy };
}

async function decide(deps: ChainDeps, subject: ApprovalSubject, subjectId: string, state: "approved" | "rejected", by: Actor, opts: { version?: string; approvalId?: string; reason?: string | null }): Promise<Result> {
  const res = await deps.approvals.decide({
    subjectType: subject,
    subjectId,
    state,
    decidedBy: by.personId,
    reason: opts.reason ?? null,
    ...(opts.approvalId && opts.version ? { expect: { id: opts.approvalId, version: opts.version } } : {}),
  });
  if (!res.ok) return res;
  return res.decided ? { ok: true } : { ok: false, error: LOST };
}

// ── candidate messages ─────────────────────────────────────────────────────

async function messageAndApp(deps: ChainDeps, messageId: string) {
  const msg = await deps.store.message(messageId);
  if (!msg || msg.mode !== "live") return null;
  const app = await deps.store.application(msg.applicationId);
  return app ? { msg, app } : null;
}

export async function approveMessage(deps: ChainDeps, messageId: string, seenVersion: string, by: Actor): Promise<ActionResult> {
  const found = await messageAndApp(deps, messageId);
  if (!found) return { ok: false, error: "No such message." };
  const { msg, app } = found;
  if (app.archived) return { ok: false, error: "The application is archived; nothing is sent." };
  if (msg.kind !== "invite" && msg.kind !== "decline") return { ok: false, error: "A decision's message is approved with the decision." };
  if (app.step !== "message-ready" || msg.status !== "pending") return { ok: false, error: NOT_WAITING };
  const current = messageVersion(msg);
  const bound = await bind(deps, "hiring_message", msg.id, current, seenVersion, async () => {
    await withdrawAsk(deps, "hiring_message", msg.id, { id: app.id, epoch: app.epoch, what: `message-${msg.id}` }, by.personId, "Asked again for the message as it is now.");
    await deps.store.updateMessage(msg.id, { version: current }, { status: ["pending"] });
    return askMessage(deps, app, { ...msg, version: current });
  });
  if (!bound.ok) return bound;
  const decided = await decide(deps, "hiring_message", msg.id, "approved", by, { approvalId: bound.approvalId, version: current });
  if (!decided.ok) return decided;
  // Fenced on the version just approved: an edit that slipped in between leaves it pending, and the send asks again.
  await deps.store.updateMessage(msg.id, { status: "approved", approvedBy: by.personId, approvedAt: deps.now().toISOString() }, { status: ["pending"], version: current });
  await deps.runs.close(waitTick(app.id, app.epoch, `message-${msg.id}`, current), { status: "ok", summary: `ok, approved by ${by.email}` });
  await deps.store.setApplication(app.id, { step: "send" }, { step: "message-ready" });
  return { ok: true, next: { application: app.id } };
}

/** Don't send: the message is withdrawn. An invitation leaves the application interviewing (arranged by hand); a decline closes the run. */
export async function dontSendMessage(deps: ChainDeps, messageId: string, by: Actor, reason: string | null): Promise<ActionResult> {
  const found = await messageAndApp(deps, messageId);
  if (!found) return { ok: false, error: "No such message." };
  const { msg, app } = found;
  if (msg.kind !== "invite" && msg.kind !== "decline") return { ok: false, error: "Reject the proposed decision instead." };
  if (app.step !== "message-ready" || msg.status !== "pending") return { ok: false, error: NOT_WAITING };
  const decided = await decide(deps, "hiring_message", msg.id, "rejected", by, { reason: reason?.trim() || "Don't send" });
  if (!decided.ok) return decided;
  await deps.store.updateMessage(msg.id, { status: "withdrawn", error: reason?.trim() || "Not sent: the approver chose Don't send." }, { status: ["pending"] });
  await deps.runs.close(waitTick(app.id, app.epoch, `message-${msg.id}`, msg.version), { status: "ok", summary: `ok, rejected by ${by.email}` });
  const next = msg.kind === "invite" ? "interviewing" : "closed";
  await deps.store.setApplication(app.id, { step: next }, { step: "message-ready" });
  return { ok: true, notice: msg.kind === "invite" ? "Not sent. The application stays at its interview stage; arrange it by hand." : "Not sent. The application's run is closed." };
}

/** The approver's edit: the body (and subject) change, so the version does, and the approval is asked again. */
export async function editMessage(deps: ChainDeps, messageId: string, patch: { subject?: string; body: string }, by: Actor): Promise<ActionResult> {
  const found = await messageAndApp(deps, messageId);
  if (!found) return { ok: false, error: "No such message." };
  const { msg, app } = found;
  if (msg.status !== "pending") return { ok: false, error: "Only a message waiting on its approval can be edited." };
  const body = patch.body.replace(/\r\n/g, "\n").trim();
  const subject = (patch.subject ?? msg.subject).replace(/\s+/g, " ").trim();
  if (!body) return { ok: false, error: "The message cannot be empty." };
  if (body.length > BODY_MAX) return { ok: false, error: `Keep the message under ${BODY_MAX} characters.` };
  if (!subject || subject.length > SUBJECT_MAX) return { ok: false, error: `The subject needs 1 to ${SUBJECT_MAX} characters.` };
  const version = messageVersion({ toEmail: msg.toEmail, subject, body });
  if (version === msg.version) return { ok: true, notice: "Nothing changed." };
  const edited = { ...msg, subject, body, version };

  if (msg.kind === "invite" || msg.kind === "decline") {
    if (app.step !== "message-ready") return { ok: false, error: NOT_WAITING };
    await withdrawAsk(deps, "hiring_message", msg.id, { id: app.id, epoch: app.epoch, what: `message-${msg.id}` }, by.personId, `Edited by ${by.email}; asked again.`);
    const saved = await deps.store.updateMessage(msg.id, { subject, body, version }, { status: ["pending"] });
    if (!saved) return { ok: false, error: NOT_WAITING };
    const asked = await askMessage(deps, app, edited);
    return asked.ok ? { ok: true, notice: "Saved. The approval was asked again for the edited message." } : asked;
  }

  // A decision's message: the decision's version covers it, so the decision is asked again.
  if (app.step !== "decision-ready" || !app.proposal) return { ok: false, error: NOT_WAITING };
  const p = app.proposal;
  await withdrawAsk(deps, decisionSubject(p.outcome), app.id, { id: app.id, epoch: app.epoch, what: `decision-${p.proposedAt}` }, by.personId, `Message edited by ${by.email}; asked again.`);
  const saved = await deps.store.updateMessage(msg.id, { subject, body, version }, { status: ["pending"] });
  if (!saved) return { ok: false, error: NOT_WAITING };
  const ctx = await deps.store.messageContext(app.id, null);
  const asked = await askDecision(deps, app, p, edited, ctx.facts.roleTitle);
  return asked.ok ? { ok: true, notice: "Saved. The decision was asked again with the edited message." } : asked;
}

// ── decisions ──────────────────────────────────────────────────────────────

/** A recruiter proposes a hire or a rejection; nothing is written to the application's status until it is approved. */
export async function proposeDecision(deps: ChainDeps, applicationId: string, input: { outcome: DecisionOutcome; reason: string }, by: Actor): Promise<ActionResult> {
  const app = await deps.store.application(applicationId);
  if (!app || app.step === null) return { ok: false, error: "This application is not in the hiring chain." };
  if (app.archived) return { ok: false, error: "The application is archived." };
  if (app.error) return { ok: false, error: "The application's run is stopped. Retry it first." };
  if (!PROPOSABLE_FROM.includes(app.step)) return { ok: false, error: "A decision can be proposed once the application is at triage or interviewing, with nothing else waiting." };
  const reason = input.reason.replace(/\s+/g, " ").trim();
  if (input.outcome === "rejected" && !reason) return { ok: false, error: "Say why: the reason stays on the record (it is never in the message)." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason under 500 characters." };
  const proposal: Proposal = { outcome: input.outcome, reason, proposedBy: by.personId, proposedAt: deps.now().toISOString(), from: app.step };
  const moved = await deps.store.setApplication(app.id, { step: "ask-decision", proposal }, { step: app.step });
  return moved ? { ok: true, next: { application: app.id } } : { ok: false, error: NOT_WAITING };
}

/** Puts the application back where it was: the proposal and its message are withdrawn. */
async function dropProposal(deps: ChainDeps, app: ChainApplication, p: Proposal, why: string): Promise<void> {
  const msg = await deps.store.activeMessage(sendKey(app.id, p.outcome === "hired" ? "decision_hire" : "decision_reject", null));
  if (msg) await deps.store.updateMessage(msg.id, { status: "withdrawn", error: why }, { status: ["pending"] });
  await deps.store.setApplication(app.id, { step: p.from, proposal: null }, { step: "decision-ready" });
}

export async function approveDecision(deps: ChainDeps, applicationId: string, seenVersion: string, by: Actor): Promise<ActionResult> {
  const app = await deps.store.application(applicationId);
  if (!app?.proposal || app.step !== "decision-ready") return { ok: false, error: NOT_WAITING };
  if (app.archived) return { ok: false, error: "The application is archived; nothing is written." };
  const p = app.proposal;
  const subject = decisionSubject(p.outcome);
  const msg = await deps.store.activeMessage(sendKey(app.id, p.outcome === "hired" ? "decision_hire" : "decision_reject", null));
  if (!msg) return { ok: false, error: "The decision's message is missing; withdraw the proposal and propose again." };
  const current = decisionVersion({ outcome: p.outcome, reason: p.reason, messageVersion: msg.version });
  const bound = await bind(deps, subject, app.id, current, seenVersion, async () => {
    await withdrawAsk(deps, subject, app.id, { id: app.id, epoch: app.epoch, what: `decision-${p.proposedAt}` }, by.personId, "Asked again for the decision as it is now.");
    const ctx = await deps.store.messageContext(app.id, null);
    return askDecision(deps, app, p, msg, ctx.facts.roleTitle);
  });
  if (!bound.ok) return bound;
  // Decision 3: whoever proposed a hire does not approve it. An account with
  // no person behind it cannot be shown not to be the proposer, so it is refused too.
  if (p.outcome === "hired") {
    if (!by.personId) return { ok: false, error: "Your account has no person record, so it cannot approve a hire: the hire must be approved by someone other than its proposer." };
    if (bound.requestedBy === by.personId || p.proposedBy === by.personId) {
      return { ok: false, error: "You proposed this hire, so another holder of Hiring approver decides it." };
    }
  }
  const decided = await decide(deps, subject, app.id, "approved", by, { approvalId: bound.approvalId, version: current });
  if (!decided.ok) return decided;
  await deps.runs.close(waitTick(app.id, app.epoch, `decision-${p.proposedAt}`, current), { status: "ok", summary: `ok, approved by ${by.email}` });
  await deps.store.setApplication(app.id, { step: "decide" }, { step: "decision-ready" });
  return { ok: true, next: { application: app.id } };
}

export async function rejectDecision(deps: ChainDeps, applicationId: string, by: Actor, reason: string | null): Promise<ActionResult> {
  const app = await deps.store.application(applicationId);
  if (!app?.proposal || app.step !== "decision-ready") return { ok: false, error: NOT_WAITING };
  const p = app.proposal;
  const decided = await decide(deps, decisionSubject(p.outcome), app.id, "rejected", by, { reason: reason?.trim() || null });
  if (!decided.ok) return decided;
  const msg = await deps.store.activeMessage(sendKey(app.id, p.outcome === "hired" ? "decision_hire" : "decision_reject", null));
  const version = msg ? decisionVersion({ outcome: p.outcome, reason: p.reason, messageVersion: msg.version }) : "";
  await deps.runs.close(waitTick(app.id, app.epoch, `decision-${p.proposedAt}`, version), { status: "ok", summary: `ok, rejected by ${by.email}` });
  await dropProposal(deps, app, p, "The proposal was rejected.");
  return { ok: true, notice: "The proposal was rejected. Nothing was written or sent." };
}

/** The proposer takes the proposal back before anyone decides it. */
export async function withdrawDecision(deps: ChainDeps, applicationId: string, by: Actor): Promise<ActionResult> {
  const app = await deps.store.application(applicationId);
  if (!app?.proposal || app.step !== "decision-ready") return { ok: false, error: NOT_WAITING };
  const p = app.proposal;
  const withdrawn = await withdrawAsk(deps, decisionSubject(p.outcome), app.id, { id: app.id, epoch: app.epoch, what: `decision-${p.proposedAt}` }, by.personId, `Withdrawn by ${by.email}.`);
  if (!withdrawn.ok) return withdrawn;
  await dropProposal(deps, app, p, "The proposal was withdrawn.");
  return { ok: true, notice: "Withdrawn. The approval is cancelled and nothing was written or sent." };
}

// ── shortlists ─────────────────────────────────────────────────────────────

async function shortlistAndReq(deps: ChainDeps, shortlistId: string): Promise<{ s: Shortlist; req: ChainRequisition } | null> {
  const s = await deps.store.shortlist(shortlistId);
  if (!s || s.mode !== "live") return null;
  const req = await deps.store.requisition(s.requisitionId);
  return req ? { s, req } : null;
}

export async function approveShortlist(deps: ChainDeps, shortlistId: string, seenVersion: string, by: Actor): Promise<ActionResult> {
  const found = await shortlistAndReq(deps, shortlistId);
  if (!found) return { ok: false, error: "No such shortlist." };
  const { s, req } = found;
  if (s.status !== "proposed" || req.step !== "shortlist-ready") return { ok: false, error: NOT_WAITING };
  const current = shortlistVersion(s.round, s.items);
  const bound = await bind(deps, "hiring_shortlist", s.id, current, seenVersion, async () => {
    await withdrawAsk(deps, "hiring_shortlist", s.id, { id: req.id, epoch: req.epoch, what: `shortlist-${s.id}` }, by.personId, "Asked again for the lanes as they are now.");
    await deps.store.updateShortlist(s.id, { version: current }, { status: ["proposed"] });
    return askShortlist(deps, req, { ...s, version: current });
  });
  if (!bound.ok) return bound;
  const decided = await decide(deps, "hiring_shortlist", s.id, "approved", by, { approvalId: bound.approvalId, version: current });
  if (!decided.ok) return decided;
  await deps.store.updateShortlist(s.id, { status: "approved", decidedAt: deps.now().toISOString() }, { status: ["proposed"] });
  await deps.runs.close(waitTick(req.id, req.epoch, `shortlist-${s.id}`, current), { status: "ok", summary: `ok, approved by ${by.email}` });
  await deps.store.setRequisition(req.id, { step: "apply-shortlist" }, { step: "shortlist-ready" });
  return { ok: true, next: { requisition: req.id } };
}

export async function rejectShortlist(deps: ChainDeps, shortlistId: string, by: Actor, reason: string | null): Promise<ActionResult> {
  const found = await shortlistAndReq(deps, shortlistId);
  if (!found) return { ok: false, error: "No such shortlist." };
  const { s, req } = found;
  if (s.status !== "proposed" || req.step !== "shortlist-ready") return { ok: false, error: NOT_WAITING };
  const decided = await decide(deps, "hiring_shortlist", s.id, "rejected", by, { reason: reason?.trim() || null });
  if (!decided.ok) return decided;
  await deps.store.updateShortlist(s.id, { status: "rejected", decidedAt: deps.now().toISOString() }, { status: ["proposed"] });
  await deps.runs.close(waitTick(req.id, req.epoch, `shortlist-${s.id}`, s.version), { status: "ok", summary: `ok, rejected by ${by.email}` });
  await deps.store.setRequisition(req.id, { step: "collecting" }, { step: "shortlist-ready" });
  return { ok: true, notice: "Rejected. Every application stays at triage and nothing moved." };
}

/** Moving a candidate between lanes changes the version, so the approval is asked again. */
export async function moveLane(deps: ChainDeps, shortlistId: string, applicationId: string, lane: Lane, by: Actor): Promise<ActionResult> {
  const found = await shortlistAndReq(deps, shortlistId);
  if (!found) return { ok: false, error: "No such shortlist." };
  const { s, req } = found;
  if (s.status !== "proposed" || req.step !== "shortlist-ready") return { ok: false, error: NOT_WAITING };
  if (!s.items.some((i) => i.application_id === applicationId)) return { ok: false, error: "That application is not on this shortlist." };
  const items = s.items.map((i) => (i.application_id === applicationId ? { ...i, lane, reason: `Moved to ${lane} by ${by.email}.` } : i));
  const version = shortlistVersion(s.round, items);
  await withdrawAsk(deps, "hiring_shortlist", s.id, { id: req.id, epoch: req.epoch, what: `shortlist-${s.id}` }, by.personId, `Lanes changed by ${by.email}.`);
  const saved = await deps.store.updateShortlist(s.id, { items, version }, { status: ["proposed"] });
  if (!saved) return { ok: false, error: NOT_WAITING };
  const asked = await askShortlist(deps, req, { ...s, items, version });
  return asked.ok ? { ok: true } : asked;
}

/** A recruiter asks for a shortlist now, from collecting or from an open requisition not yet in the chain. */
export async function startShortlist(deps: ChainDeps, requisitionId: string): Promise<ActionResult> {
  const req = await deps.store.requisition(requisitionId);
  if (!req) return { ok: false, error: "No such requisition." };
  if (req.status !== "open") return { ok: false, error: "Only an open requisition proposes a shortlist." };
  if (req.error) return { ok: false, error: "The requisition's run is stopped. Retry it first." };
  if (req.step !== null && req.step !== "collecting") return { ok: false, error: "The requisition is not collecting applications right now." };
  // Nothing to propose: refused here, so no step runs to find nothing.
  if ((await deps.store.triageApplications(req.id)).length === 0) return { ok: false, error: "No screened application waits at triage, so there is nothing to shortlist yet." };
  const patch = req.step === null ? { step: "shortlist" as const, epoch: deps.now().toISOString() } : { step: "shortlist" as const };
  const moved = await deps.store.setRequisition(req.id, patch, { step: req.step });
  return moved ? { ok: true, next: { requisition: req.id } } : { ok: false, error: NOT_WAITING };
}

// ── opening a requisition ──────────────────────────────────────────────────

export async function askToOpen(deps: ChainDeps, requisitionId: string): Promise<ActionResult> {
  const req = await deps.store.requisition(requisitionId);
  if (!req) return { ok: false, error: "No such requisition." };
  if (req.status !== "draft") return { ok: false, error: "Only a draft requisition is asked to open." };
  if (req.step !== null && req.step !== "closed") return { ok: false, error: "Opening this requisition is already under way." };
  const moved = await deps.store.setRequisition(req.id, { step: "ask-open", epoch: deps.now().toISOString(), error: null }, { step: req.step });
  return moved ? { ok: true, next: { requisition: req.id } } : { ok: false, error: NOT_WAITING };
}

export async function approveRequisition(deps: ChainDeps, requisitionId: string, seenVersion: string, by: Actor): Promise<ActionResult> {
  const req = await deps.store.requisition(requisitionId);
  if (!req || req.step !== "open-ready") return { ok: false, error: NOT_WAITING };
  const current = requisitionVersion(req.content);
  const bound = await bind(deps, "hiring_requisition", req.id, current, seenVersion, async () => {
    await withdrawAsk(deps, "hiring_requisition", req.id, { id: req.id, epoch: req.epoch, what: "open" }, by.personId, "Asked again for the requisition as it is now.");
    return askRequisition(deps, req, null);
  });
  if (!bound.ok) return bound;
  const decided = await decide(deps, "hiring_requisition", req.id, "approved", by, { approvalId: bound.approvalId, version: current });
  if (!decided.ok) return decided;
  await deps.runs.close(waitTick(req.id, req.epoch, "open", current), { status: "ok", summary: `ok, approved by ${by.email}` });
  await deps.store.setRequisition(req.id, { step: "open" }, { step: "open-ready" });
  return { ok: true, next: { requisition: req.id } };
}

export async function rejectRequisition(deps: ChainDeps, requisitionId: string, by: Actor, reason: string | null): Promise<ActionResult> {
  const req = await deps.store.requisition(requisitionId);
  if (!req || req.step !== "open-ready") return { ok: false, error: NOT_WAITING };
  const latest = await deps.approvals.latest("hiring_requisition", req.id);
  const decided = await decide(deps, "hiring_requisition", req.id, "rejected", by, { reason: reason?.trim() || null });
  if (!decided.ok) return decided;
  const version = typeof latest?.metadata.version === "string" ? latest.metadata.version : "";
  await deps.runs.close(waitTick(req.id, req.epoch, "open", version), { status: "ok", summary: `ok, rejected by ${by.email}` });
  await deps.store.setRequisition(req.id, { step: null }, { step: "open-ready" });
  return { ok: true, notice: "Rejected. The requisition stays a draft." };
}

/**
 * A message stuck in "sending" past the email provider's duplicate window
 * (review finding 4): a person who checked says whether it went. "sent" marks
 * it so and moves the run on; "resend" hands the claim back and restarts the
 * run, which sends it once more.
 */
export async function settleStuckMessage(deps: ChainDeps, messageId: string, outcome: "sent" | "resend", by: Actor): Promise<ActionResult> {
  const found = await messageAndApp(deps, messageId);
  if (!found || found.msg.status !== "sending") return { ok: false, error: "That message is not stuck in sending." };
  const { msg, app } = found;
  const now = deps.now().toISOString();
  if (outcome === "sent") {
    await deps.store.updateMessage(msg.id, { status: "sent", sentAt: now, error: `Confirmed sent by ${by.email}.` }, { status: ["sending"] });
    await deps.store.setApplication(app.id, { step: msg.kind === "invite" ? "interviewing" : "closed", error: null }, { step: "send" });
    return { ok: true, notice: "Marked sent. Nothing was sent again." };
  }
  await deps.store.updateMessage(msg.id, { status: "approved", claimedAt: null, error: `Sent again at the request of ${by.email}.` }, { status: ["sending"] });
  await deps.store.setApplication(app.id, { error: null, epoch: now });
  return { ok: true, next: { application: app.id } };
}

// ── stop, retry, close ─────────────────────────────────────────────────────

export async function retryApplication(deps: ChainDeps, applicationId: string): Promise<ActionResult> {
  const app = await deps.store.application(applicationId);
  if (!app?.error) return { ok: false, error: "The run is not stopped." };
  await deps.store.setApplication(app.id, { error: null, epoch: deps.now().toISOString() });
  return { ok: true, next: { application: app.id } };
}

export async function retryRequisition(deps: ChainDeps, requisitionId: string): Promise<ActionResult> {
  const req = await deps.store.requisition(requisitionId);
  if (!req?.error) return { ok: false, error: "The run is not stopped." };
  await deps.store.setRequisition(req.id, { error: null, epoch: deps.now().toISOString() });
  return { ok: true, next: { requisition: req.id } };
}

/**
 * A requisition closed (filled, closed, cancelled): its run ends, and every
 * hiring approval pending under it is withdrawn, its own and its applications'.
 * An application still interviewing keeps its run, so a decision can still be
 * proposed and its message sent.
 */
export async function closeRequisitionRun(deps: ChainDeps, requisitionId: string, by: Actor): Promise<Result> {
  const req = await deps.store.requisition(requisitionId);
  if (!req) return { ok: true };
  const why = `The requisition was closed by ${by.email}.`;
  await withdrawAsk(deps, "hiring_requisition", req.id, { id: req.id, epoch: req.epoch, what: "open" }, by.personId, why);
  for (const s of await deps.store.shortlists(req.id)) {
    if (s.mode !== "live" || s.status !== "proposed") continue;
    await withdrawAsk(deps, "hiring_shortlist", s.id, { id: req.id, epoch: req.epoch, what: `shortlist-${s.id}` }, by.personId, why);
    await deps.store.updateShortlist(s.id, { status: "withdrawn", decidedAt: deps.now().toISOString() }, { status: ["proposed"] });
  }
  for (const app of await deps.store.chainApplications(req.id)) {
    // Interviewing keeps its run for a decision; at decide or send the
    // decision is recorded and its message still goes (review finding 6).
    if (app.step === "interviewing" || decisionInFlight(app)) continue;
    await closeApplicationRun(deps, app, by.personId, why);
  }
  if (req.step !== null) await deps.store.setRequisition(req.id, { step: "closed" }, { step: req.step });
  return { ok: true };
}
