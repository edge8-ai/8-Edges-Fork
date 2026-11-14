import { modelFlag } from "@/entities/hiring/lib/resume-precheck";
import { askDecision, askMessage, decisionSubject, withdrawAsk } from "./ask";
import { closeApplicationRun } from "./close-run";
import { sendKey, type ApplicationStep, type MessageKind } from "./steps";
import { messageHtml, renderMessage, TemplateRefused } from "./templates";
import { isFinalStatus, type CandidateMessage, type ChainApplication, type ChainDeps, type StepOutcome } from "./types";
import { decisionVersion, messageVersion } from "./versions";

// The application machine (spec section 3b). One call runs the one step the
// application is at; the driver calls it once per tick and a person's button
// calls it inline, both under the step's tick, so it never runs twice at once.
// Every write is fenced on the step it read, a send is claimed before it is
// made and carries its send key to Resend, and the decision is one fenced RPC.
//
// Shadow (Z.17): only the screen runs in shadow. A step that would draft,
// ask, send or decide refuses in shadow; the driver does not offer it one,
// and this is the second fence.

const HELD = "The hiring chain is in shadow: this step drafts, asks, sends or decides, so it waits until the chain is live.";

// A send claim older than this was left by a run that died; within Resend's
// 24-hour key window it is taken again (the key deduplicates), past about 23
// hours it is a person's to settle, because a resend could deliver twice.
const CLAIM_STALE_MS = 10 * 60_000;
const CLAIM_EXPIRES_MS = 23 * 60 * 60_000;

/** A failure retrying cannot fix: the run stops at once with the reason on the application. */
class Permanent extends Error {}

// The screen failures retrying cannot help with (resume-screen.ts's own
// words): the application goes on to triage with its screen marked failed,
// so a person reads the résumé.
const PERMANENT_SCREEN = [
  /no resume on file/i,
  /unsupported resume format/i,
  /protected or damaged/i,
  /no extractable text/i,
  /declined to screen/i,
  /not configured/i,
  /application not found/i,
];

export function isPermanentScreenFailure(error: string): boolean {
  return PERMANENT_SCREEN.some((p) => p.test(error));
}

const ok = (app: ChainApplication, step: string, next: string | null, summary: string): StepOutcome => ({ ok: true, id: app.id, step, next, summary });
const fail = (id: string, step: string, error: string): StepOutcome => ({ ok: false, id, step, error });

export async function advanceApplication(id: string, deps: ChainDeps): Promise<StepOutcome> {
  const app = await deps.store.application(id);
  if (!app) return { skipped: "No such application.", id };
  if (app.error) return { skipped: "The run is stopped; Retry starts it again.", id };
  const step = app.step;
  if (!step) return { skipped: "The application is not in the chain.", id };
  try {
    // A decision already recorded (decide, send) still tells the candidate, archived or not.
    if (app.archived && step !== "closed" && step !== "decide" && step !== "send") return await closeArchived(app, deps);
    switch (step) {
      case "screen":
        return await screenStep(app, deps);
      case "draft-invite":
      case "draft-decline":
        return await draftStep(app, step, deps);
      case "send":
        return await sendStep(app, deps);
      case "ask-decision":
        return await askDecisionStep(app, deps);
      case "decide":
        return await decideStep(app, deps);
      default:
        return { skipped: `The application waits at ${step}.`, id };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Permanent || err instanceof TemplateRefused) {
      await deps.store.setApplication(id, { error: message.slice(0, 500) });
      return fail(id, step, `Stopped: ${message}`);
    }
    return fail(id, step, message);
  }
}

function refuseInShadow(deps: ChainDeps): void {
  if (deps.mode() === "shadow") throw new Error(HELD);
}

/** An archived application leaves the chain: what waits on the approver is withdrawn. */
async function closeArchived(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  await closeApplicationRun(deps, app, null, "The application was archived.");
  return ok(app, app.step ?? "closed", "closed", "The application is archived; its run is closed.");
}

// ── screen ─────────────────────────────────────────────────────────────────
async function screenStep(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  // The pre-check reads the candidate's own text first; a flag never blocks.
  const flags = await deps.precheck(app.id);
  const res = await deps.screen(app.id);
  if (!res.ok) {
    if (!isPermanentScreenFailure(res.error)) return fail(app.id, "screen", `The screen failed and will be retried: ${res.error}`);
    flags.push({ source: "screen", kind: "screen-failed", quote: res.error.slice(0, 120) });
  } else if (res.report) {
    flags.push(...modelFlag(res.report.instructionsFound, res.report.instructionsQuote));
  }
  const moved = await deps.store.setApplication(app.id, { step: "triage", flags }, { step: "screen" });
  if (!moved) return { skipped: "The application left the screen step meanwhile.", id: app.id };
  // An open requisition not yet in the chain starts collecting with its first
  // screened application, so its shortlist is proposed once enough wait.
  const req = await deps.store.requisition(app.jobRequisitionId);
  if (req && req.step === null && req.status === "open") {
    await deps.store.setRequisition(req.id, { step: "collecting", epoch: deps.now().toISOString() }, { step: null });
  }
  const how = res.ok ? "Screened" : "The screen could not read the résumé";
  return ok(app, "screen", "triage", `${how}; ${flags.length === 0 ? "nothing flagged" : `${flags.length} flag${flags.length === 1 ? "" : "s"}`}. Waits for the shortlist.`);
}

// ── draft an invite or a decline ───────────────────────────────────────────
async function draftMessage(app: ChainApplication, kind: MessageKind, stageId: string | null, deps: ChainDeps, runTick: string, mode: "live" | "shadow"): Promise<CandidateMessage> {
  const key = sendKey(app.id, kind, stageId);
  if (mode === "live") {
    const active = await deps.store.activeMessage(key);
    if (active) return active;
  }
  const ctx = await deps.store.messageContext(app.id, stageId);
  if (!ctx.toEmail) throw new Permanent("The candidate has no email address on file.");
  const rendered = renderMessage(kind, ctx.facts, deps.orgName());
  return deps.store.insertMessage({
    applicationId: app.id,
    personId: app.personId,
    kind,
    stageId,
    mode,
    status: "pending",
    toEmail: ctx.toEmail,
    subject: rendered.subject,
    body: rendered.body,
    draftedBody: rendered.body,
    version: messageVersion({ toEmail: ctx.toEmail, subject: rendered.subject, body: rendered.body }),
    sendKey: key,
    runTick,
  });
}

/** A shadow run's draft of what the chain would have sent; nothing is asked or sent. */
export async function draftShadowMessage(app: ChainApplication, kind: MessageKind, stageId: string | null, deps: ChainDeps, runTick: string): Promise<CandidateMessage> {
  return draftMessage(app, kind, stageId, deps, runTick, "shadow");
}

async function draftStep(app: ChainApplication, step: "draft-invite" | "draft-decline", deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  // A person already decided this candidate by hand (review finding 1): nothing more is drafted.
  if (isFinalStatus(app.status)) return closeDecidedByHand(app, deps);
  const kind: MessageKind = step === "draft-invite" ? "invite" : "decline";
  const stageId = kind === "invite" ? app.currentStageId : null;
  const msg = await draftMessage(app, kind, stageId, deps, `${app.epoch ?? "-"}:${step}`, "live");
  if (msg.status === "approved" || msg.status === "sending" || msg.status === "sent") {
    // A retry after the approver already decided: go on to the send.
    await deps.store.setApplication(app.id, { step: "send" }, { step });
    return ok(app, step, "send", "The message was already approved; going on to the send.");
  }
  const asked = await askMessage(deps, app, msg);
  if (!asked.ok) return fail(app.id, step, asked.error);
  await deps.store.setApplication(app.id, { step: "message-ready" }, { step });
  return ok(app, step, "message-ready", `Drafted the ${kind === "invite" ? "invitation" : "decline"}; it waits on its approval.`);
}

// ── send ───────────────────────────────────────────────────────────────────
function nextAfterSend(kind: MessageKind): ApplicationStep {
  return kind === "invite" ? "interviewing" : "closed";
}

/** The message this application's send step is for: the newest live one approved, being sent, or sent. */
async function sendable(app: ChainApplication, deps: ChainDeps): Promise<CandidateMessage | null> {
  const live = (await deps.store.messages(app.id)).filter((m) => m.mode === "live");
  return live.find((m) => m.status === "approved" || m.status === "sending") ?? live.find((m) => m.status === "sent") ?? null;
}

/** Whether the approval on record is for exactly this message as it is. */
async function messageApproved(msg: CandidateMessage, app: ChainApplication, deps: ChainDeps): Promise<boolean> {
  if (msg.kind === "invite" || msg.kind === "decline") {
    const a = await deps.approvals.latest("hiring_message", msg.id);
    return a?.state === "approved" && a.metadata.version === msg.version;
  }
  const a = await deps.approvals.latest(msg.kind === "decision_hire" ? "hiring_hire" : "hiring_reject", app.id);
  return a?.state === "approved" && a.metadata.messageVersion === msg.version;
}

async function sendStep(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  const msg = await sendable(app, deps);
  if (!msg) return fail(app.id, "send", "No approved message to send.");
  const next = nextAfterSend(msg.kind);
  if (msg.status === "sent") {
    // A retry after the send landed: one email, and the run moves on.
    await deps.store.setApplication(app.id, { step: next }, { step: "send" });
    return ok(app, "send", next, "Already sent; nothing was sent again.");
  }

  if (!(await messageApproved(msg, app, deps))) {
    // The message is not what was approved (edited since, or the approval
    // withdrawn): it goes back to its approver as it is now.
    await deps.store.updateMessage(msg.id, { status: "pending", approvedAt: null, approvedBy: null, claimedAt: null }, { status: ["approved", "sending"] });
    if (msg.kind === "invite" || msg.kind === "decline") {
      const fresh = (await deps.store.message(msg.id)) ?? msg;
      await withdrawAsk(deps, "hiring_message", msg.id, { id: app.id, epoch: app.epoch, what: `message-${msg.id}` }, null, "The message changed after its approval.");
      const asked = await askMessage(deps, app, fresh);
      if (!asked.ok) return fail(app.id, "send", asked.error);
      await deps.store.setApplication(app.id, { step: "message-ready" }, { step: "send" });
      return ok(app, "send", "message-ready", "The message differs from the approved version; it was sent back for approval and nothing was sent.");
    }
    throw new Permanent("The decision message differs from the approved version; nothing was sent.");
  }

  // An invitation or a decline for a candidate a person already decided by
  // hand is never sent (review finding 1). Checked before the claim: once the
  // chain claims a decline it records the rejection itself, so a rejected
  // status after that claim is its own.
  if ((msg.kind === "invite" || msg.kind === "decline") && msg.status === "approved" && isFinalStatus(app.status)) {
    return withdrawDecided(app, msg, deps, `A person already set this application to ${app.status}; the ${msg.kind === "invite" ? "invitation" : "decline"} was not sent.`);
  }

  // Everything that could stop the send is checked before anything is
  // written, so a decline is never recorded without its email (finding 5).
  const problem = deps.emailProblem();
  if (problem) throw new Permanent(problem);
  if (!msg.toEmail.trim()) throw new Permanent("The message has no recipient.");

  const now = deps.now().getTime();
  const staleBefore = new Date(now - CLAIM_STALE_MS).toISOString();
  const expiredBefore = new Date(now - CLAIM_EXPIRES_MS).toISOString();
  if (!(await deps.store.claimMessage(msg.id, staleBefore, expiredBefore))) {
    const again = await deps.store.message(msg.id);
    if (again?.status === "sent") {
      await deps.store.setApplication(app.id, { step: next }, { step: "send" });
      return ok(app, "send", next, "Another run sent it; nothing was sent again.");
    }
    if (again?.status === "sending" && again.claimedAt !== null && again.claimedAt < expiredBefore) {
      // Past Resend's 24-hour key window a second attempt could deliver twice,
      // and nothing here can tell whether the first one did (finding 4).
      throw new Permanent(`The message has been sending since ${again.claimedAt}, past the email provider's 24-hour duplicate window, so it may already have gone. A person confirms it: mark it sent, or send it again.`);
    }
    return fail(app.id, "send", "Another run holds the send; it will be checked again.");
  }

  // A decline is a decision too: recorded, fenced, after the claim and before the message says so.
  if (msg.kind === "decline") {
    if (app.status === "hired" || app.status === "withdrawn") return withdrawDecided(app, msg, deps, `The application is ${app.status}; the decline was not sent.`);
    const approval = await deps.approvals.latest("hiring_message", msg.id);
    await deps.recordDecision(app.id, "rejected", "Declined at the shortlist.", approval?.decidedBy ?? null);
    const after = await deps.store.application(app.id);
    if (after && after.status !== "rejected") return withdrawDecided(app, msg, deps, `The application is ${after.status}; the decline was not sent.`);
  }

  const ctx = await deps.store.messageContext(app.id, msg.stageId);
  let sent: boolean;
  try {
    sent = await deps.send({
      to: msg.toEmail,
      subject: msg.subject,
      html: messageHtml(msg.body),
      ...(ctx.replyTo ? { replyTo: ctx.replyTo } : {}),
      idempotencyKey: msg.sendKey,
      logMeta: { source: "hiring-chain", application_id: app.id, message_id: msg.id, kind: msg.kind },
    });
  } catch (err) {
    // The provider may have taken it and the reply been lost: the claim stays,
    // so only a retry inside the key window (which Resend deduplicates) or a
    // person can send it again (finding 4).
    const why = err instanceof Error ? err.message : String(err);
    await deps.store.updateMessage(msg.id, { error: `Outcome unknown: ${why}`.slice(0, 500) }, { status: ["sending"] });
    return fail(app.id, "send", `The send's outcome is unknown (${why}); it is retried under the same key while the provider remembers it.`);
  }
  if (!sent) {
    await deps.store.updateMessage(msg.id, { status: "approved", claimedAt: null, error: "The email provider did not accept the send." }, { status: ["sending"] });
    return fail(app.id, "send", "The email provider did not accept the send; it will be retried under the same key.");
  }
  await deps.store.updateMessage(msg.id, { status: "sent", sentAt: deps.now().toISOString(), error: null, providerRef: "resend" }, { status: ["sending"] });
  await deps.store.setApplication(app.id, { step: next, ...(next === "closed" ? { proposal: null } : {}) }, { step: "send" });
  return ok(app, "send", next, `Sent the ${msg.kind.replace("_", " ")} once, under ${msg.sendKey}.`);
}

/** A candidate a person decided by hand leaves the chain; nothing it drafted goes out. */
async function closeDecidedByHand(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  const why = `A person set this application to ${app.status}; the chain sends it nothing more.`;
  await closeApplicationRun(deps, app, null, why);
  return ok(app, app.step ?? "closed", "closed", why);
}

async function withdrawDecided(app: ChainApplication, msg: CandidateMessage, deps: ChainDeps, why: string): Promise<StepOutcome> {
  await deps.store.updateMessage(msg.id, { status: "withdrawn", error: why }, { status: ["pending", "approved", "sending"] });
  await deps.store.setApplication(app.id, { step: "closed", proposal: null }, { step: app.step });
  return ok(app, app.step ?? "send", "closed", why);
}

// ── ask for the decision ───────────────────────────────────────────────────
async function askDecisionStep(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  const p = app.proposal;
  if (isFinalStatus(app.status)) return closeDecidedByHand(app, deps);
  if (!p) {
    await deps.store.setApplication(app.id, { step: "interviewing" }, { step: "ask-decision" });
    return ok(app, "ask-decision", "interviewing", "No decision was proposed.");
  }
  const kind: MessageKind = p.outcome === "hired" ? "decision_hire" : "decision_reject";
  let msg = await draftMessage(app, kind, null, deps, `${app.epoch ?? "-"}:ask-decision`, "live");
  if (msg.kind !== kind) {
    // A draft left from a proposal the other way: withdraw it and draft this one.
    await deps.store.updateMessage(msg.id, { status: "withdrawn", error: "Replaced by a new proposal." }, { status: ["pending"] });
    msg = await draftMessage(app, kind, null, deps, `${app.epoch ?? "-"}:ask-decision`, "live");
  }
  const ctx = await deps.store.messageContext(app.id, null);
  const asked = await askDecision(deps, app, p, msg, ctx.facts.roleTitle);
  if (!asked.ok) return fail(app.id, "ask-decision", asked.error);
  await deps.store.setApplication(app.id, { step: "decision-ready" }, { step: "ask-decision" });
  return ok(app, "ask-decision", "decision-ready", `The ${p.outcome === "hired" ? "hire" : "rejection"} and its message wait on one approval.`);
}

// ── decide ─────────────────────────────────────────────────────────────────
async function decideStep(app: ChainApplication, deps: ChainDeps): Promise<StepOutcome> {
  refuseInShadow(deps);
  const p = app.proposal;
  if (!p) throw new Permanent("No decision is proposed on this application.");
  const subject = decisionSubject(p.outcome);
  const kind: MessageKind = p.outcome === "hired" ? "decision_hire" : "decision_reject";
  const msg = await deps.store.activeMessage(sendKey(app.id, kind, null));
  if (!msg) throw new Permanent("The decision's message is missing.");
  const approval = await deps.approvals.latest(subject, app.id);
  const version = decisionVersion({ outcome: p.outcome, reason: p.reason, messageVersion: msg.version });
  if (approval?.state !== "approved" || approval.metadata.version !== version) {
    if (approval?.state === "approved") {
      // Approved, but not this version: ask again for the decision as it is.
      const ctx = await deps.store.messageContext(app.id, null);
      const asked = await askDecision(deps, app, p, msg, ctx.facts.roleTitle);
      if (!asked.ok) return fail(app.id, "decide", asked.error);
      await deps.store.setApplication(app.id, { step: "decision-ready" }, { step: "decide" });
      return ok(app, "decide", "decision-ready", "The decision changed after its approval; it was asked again and nothing was written.");
    }
    throw new Permanent(`The decision is not approved (${approval?.state ?? "no approval"}); nothing was written.`);
  }

  // The RPC refuses a second hire or rejection but would overwrite a
  // withdrawal; a candidate who withdrew is never decided over (finding 1).
  if (app.status === "withdrawn") {
    return withdrawDecided({ ...app, step: "decide" }, msg, deps, "The candidate withdrew; this decision and its message were not used.");
  }
  const recorded = await deps.recordDecision(app.id, p.outcome, p.reason, approval.decidedBy);
  if (!recorded) {
    const now = await deps.store.application(app.id);
    if (now?.status !== p.outcome) {
      return withdrawDecided({ ...app, step: "decide" }, msg, deps, `The application was decided elsewhere (${now?.status ?? "unknown"}); this decision and its message were not used.`);
    }
    // A retry after a lost reply: the decision stands, nothing is announced twice.
  } else if (p.outcome === "hired") {
    await deps.deliverHire(app.id);
  }
  await deps.cancelInterviews(app.id);
  // Fenced on the version approved: an edit that slipped in after the approval leaves the message pending.
  const approved = await deps.store.updateMessage(
    msg.id,
    { status: "approved", approvedAt: approval.decidedAt ?? deps.now().toISOString(), approvedBy: approval.decidedBy },
    { status: ["pending"], version: msg.version },
  );
  if (!approved) {
    const current = await deps.store.message(msg.id);
    if (current?.status !== "approved") {
      throw new Permanent("The decision is recorded, but its message changed while it was approved, so it was not sent. Read it and send it from the application page.");
    }
  }
  await deps.store.setApplication(app.id, { step: "send", proposal: null }, { step: "decide" });
  return ok(app, "decide", "send", `${p.outcome === "hired" ? "Hired" : "Rejected"}${recorded ? "" : " (already recorded)"}; the message goes next.`);
}
