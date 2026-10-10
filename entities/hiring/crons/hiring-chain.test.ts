import { describe, expect, it } from "vitest";
import { advanceApplication } from "@/entities/hiring/lib/chain/application";
import { advanceRequisition } from "@/entities/hiring/lib/chain/requisition";
import {
  approveDecision,
  approveMessage,
  approveShortlist,
  closeRequisitionRun,
  dontSendMessage,
  editMessage,
  moveLane,
  proposeDecision,
  rejectDecision,
  rejectShortlist,
  retryApplication,
  settleStuckMessage,
  startShortlist,
} from "@/entities/hiring/lib/chain/approvals";
import { fakeChain, type FakeChain } from "@/entities/hiring/lib/chain/testing/fake-chain";
import { messageVersion } from "@/entities/hiring/lib/chain/versions";

// The hiring chain's three promises (plan, Part B: an idempotent re-run, a
// rejected approval never sends, a failed AI call leaves no effect), and the
// spec's own (section 12): version binding, two approvers at once, shadow,
// and closing a requisition. Run on the in-memory chain, which keeps the
// fences and unique keys the real tables keep.

const REQ = "req00000-0000-4000-8000-000000000001";
const APPROVER = { personId: "approver-person", email: "approver@example.test" };
const RECRUITER = { personId: "recruiter-person", email: "recruiter@example.test" };

/** An application at message-ready with its invitation waiting on approval. */
async function invitationWaiting(c: FakeChain, id = "app00000-0000-4000-8000-000000000001") {
  c.addRequisition({ id: REQ, step: "collecting" });
  c.addApplication({ id, jobRequisitionId: REQ, step: "draft-invite", currentStageId: "stage-interview" });
  const drafted = await advanceApplication(id, c.deps);
  expect(drafted).toMatchObject({ ok: true, next: "message-ready" });
  const msg = [...c.messages.values()].find((m) => m.applicationId === id)!;
  return { id, msg };
}

/** An application at decision-ready with a proposed outcome waiting on approval. */
async function decisionWaiting(c: FakeChain, outcome: "hired" | "rejected", id = "app00000-0000-4000-8000-000000000002") {
  c.addRequisition({ id: REQ, step: "collecting" });
  c.addApplication({ id, jobRequisitionId: REQ, step: "interviewing" });
  expect(await proposeDecision(c.deps, id, { outcome, reason: "Strong loop" }, RECRUITER)).toMatchObject({ ok: true });
  expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: true, next: "decision-ready" });
  const subject = outcome === "hired" ? "hiring_hire" : "hiring_reject";
  return { id, approval: c.pending(subject, id)! };
}

describe("an idempotent re-run", () => {
  it("sends one email for two ticks and a double click on Approve and send", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    const [first, second] = await Promise.all([approveMessage(c.deps, msg.id, msg.version, APPROVER), approveMessage(c.deps, msg.id, msg.version, APPROVER)]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    await advanceApplication(id, c.deps);
    // The second tick finds the run already past the send.
    await advanceApplication(id, c.deps);
    expect(c.sends).toHaveLength(1);
    expect([...c.messages.values()].filter((m) => m.status === "sent")).toHaveLength(1);
    expect(c.apps.get(id)?.step).toBe("interviewing");
  });

  it("sends nothing new when the send is retried after it landed", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    await advanceApplication(id, c.deps);
    // A lost reply: the step runs again at send.
    c.apps.get(id)!.step = "send";
    const again = await advanceApplication(id, c.deps);
    expect(again).toMatchObject({ ok: true, next: "interviewing" });
    expect(c.sends).toHaveLength(1);
  });

  it("announces one hire when the decide step is retried", async () => {
    const c = fakeChain();
    const { id, approval } = await decisionWaiting(c, "hired");
    expect(await approveDecision(c.deps, id, String(approval.metadata.version), APPROVER)).toMatchObject({ ok: true });
    const app = c.apps.get(id)!;
    const proposal = app.proposal;
    expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: true, next: "send" });
    // A lost reply after the RPC: the step runs again with the proposal it had.
    app.step = "decide";
    app.proposal = proposal;
    const retried = await advanceApplication(id, c.deps);
    expect(retried).toMatchObject({ ok: true, next: "send" });
    expect(c.hiresDelivered).toEqual([id]);
    expect(c.decisions.filter((d) => d.recorded)).toHaveLength(1);
    expect(app.proposal).toBeNull();
    await advanceApplication(id, c.deps);
    expect(c.sends).toHaveLength(1);
    expect(app.step).toBe("closed");
  });
});

describe("a rejected approval never sends", () => {
  it("Don't send withdraws the message and leaves the invitation to be arranged by hand", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    expect(await dontSendMessage(c.deps, msg.id, APPROVER, null)).toMatchObject({ ok: true });
    await advanceApplication(id, c.deps);
    expect(c.sends).toHaveLength(0);
    expect(c.messages.get(msg.id)?.status).toBe("withdrawn");
    expect(c.apps.get(id)?.step).toBe("interviewing");
    expect(c.decisions).toHaveLength(0);
  });

  it("a rejected hire writes no status and sends nothing", async () => {
    const c = fakeChain();
    const { id } = await decisionWaiting(c, "hired");
    expect(await rejectDecision(c.deps, id, APPROVER, "Not yet")).toMatchObject({ ok: true });
    await advanceApplication(id, c.deps);
    expect(c.decisions).toHaveLength(0);
    expect(c.sends).toHaveLength(0);
    expect(c.apps.get(id)).toMatchObject({ step: "interviewing", proposal: null, status: "active" });
  });

  it("a rejected shortlist moves nobody and drafts nothing", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "shortlist" });
    for (const n of [1, 2, 3]) c.addApplication({ id: `a${n}000000-0000-4000-8000-000000000000`, jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: n + 2 });
    expect(await advanceRequisition(REQ, c.deps)).toMatchObject({ ok: true, next: "shortlist-ready" });
    const s = [...c.shortlists.values()][0];
    expect(await rejectShortlist(c.deps, s.id, APPROVER, "Hold everyone")).toMatchObject({ ok: true });
    await advanceRequisition(REQ, c.deps);
    expect([...c.apps.values()].every((a) => a.step === "triage")).toBe(true);
    expect(c.messages.size).toBe(0);
    expect(c.sends).toHaveLength(0);
    expect(c.reqs.get(REQ)?.step).toBe("collecting");
  });
});

describe("a failed AI call leaves no effect", () => {
  it("retries a transient failure at the screen, and opens nothing", async () => {
    const c = fakeChain();
    c.addApplication({ id: "app00000-0000-4000-8000-000000000009", jobRequisitionId: REQ });
    c.screenResults.push({ ok: false, error: "overloaded_error: the model is busy" });
    const res = await advanceApplication("app00000-0000-4000-8000-000000000009", c.deps);
    expect(res).toMatchObject({ ok: false });
    expect(c.apps.get("app00000-0000-4000-8000-000000000009")?.step).toBe("screen");
    expect(c.approvals).toHaveLength(0);
    expect(c.messages.size).toBe(0);
  });

  it("moves a permanent failure to triage, flagged for a person, and opens nothing", async () => {
    const c = fakeChain();
    c.addApplication({ id: "app00000-0000-4000-8000-000000000010", jobRequisitionId: REQ });
    c.screenResults.push({ ok: false, error: "This PDF is protected or damaged and has no readable text." });
    expect(await advanceApplication("app00000-0000-4000-8000-000000000010", c.deps)).toMatchObject({ ok: true, next: "triage" });
    const app = c.apps.get("app00000-0000-4000-8000-000000000010")!;
    expect(app.flags.map((f) => f.kind)).toEqual(["screen-failed"]);
    expect(c.approvals).toHaveLength(0);
    expect(c.messages.size).toBe(0);
  });
});

describe("version binding", () => {
  it("an edit after the ask withdraws the approval and asks again", async () => {
    const c = fakeChain();
    const { msg } = await invitationWaiting(c);
    const before = c.pending("hiring_message", msg.id)!;
    const drafted = msg.body;
    expect(await editMessage(c.deps, msg.id, { body: `${drafted}\n\nA line the approver added.` }, APPROVER)).toMatchObject({ ok: true });
    expect(before.state).toBe("cancelled");
    const after = c.pending("hiring_message", msg.id)!;
    expect(after.id).not.toBe(before.id);
    expect(after.metadata.version).toBe(c.messages.get(msg.id)?.version);
    expect(c.messages.get(msg.id)?.draftedBody).toBe(drafted);
    expect(c.messages.get(msg.id)?.body).toContain("A line the approver added.");
  });

  it("Approve with a stale version decides nothing and asks again", async () => {
    const c = fakeChain();
    const { msg } = await invitationWaiting(c);
    const stale = msg.version;
    c.messages.get(msg.id)!.body = "Changed underneath the page.";
    const res = await approveMessage(c.deps, msg.id, stale, APPROVER);
    expect(res).toMatchObject({ ok: false });
    expect(c.approvals.filter((a) => a.state === "approved")).toHaveLength(0);
    expect(c.pending("hiring_message", msg.id)?.metadata.version).toBe(messageVersion(c.messages.get(msg.id)!));
  });

  it("the send step refuses a message that differs from the approved one", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    c.messages.get(msg.id)!.body = "Edited after the approval.";
    c.messages.get(msg.id)!.version = messageVersion(c.messages.get(msg.id)!);
    expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: true, next: "message-ready" });
    expect(c.sends).toHaveLength(0);
    expect(c.pending("hiring_message", msg.id)).toBeDefined();
  });

  it("two approvers at once decide once", async () => {
    const c = fakeChain();
    const { id, approval } = await decisionWaiting(c, "rejected");
    const v = String(approval.metadata.version);
    const results = await Promise.all([approveDecision(c.deps, id, v, APPROVER), approveDecision(c.deps, id, v, { personId: "second", email: "second@example.test" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(c.approvals.filter((a) => a.subjectId === id && a.state === "approved")).toHaveLength(1);
  });

  it("whoever proposed a hire cannot approve it", async () => {
    const c = fakeChain();
    const { id, approval } = await decisionWaiting(c, "hired");
    const res = await approveDecision(c.deps, id, String(approval.metadata.version), RECRUITER);
    expect(res).toMatchObject({ ok: false });
    expect(approval.requestedBy).toBe(RECRUITER.personId);
    expect(c.pending("hiring_hire", id)).toBeDefined();
  });

  it("an account with no person behind it cannot approve a hire", async () => {
    const c = fakeChain();
    const { id, approval } = await decisionWaiting(c, "hired");
    expect(await approveDecision(c.deps, id, String(approval.metadata.version), { personId: null, email: "service@example.test" })).toMatchObject({ ok: false });
    expect(c.pending("hiring_hire", id)).toBeDefined();
  });

  it("a lane move changes the shortlist's version and asks again", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "shortlist" });
    c.addApplication({ id: "a1000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.2 });
    await advanceRequisition(REQ, c.deps);
    const s = [...c.shortlists.values()][0];
    const first = c.pending("hiring_shortlist", s.id)!;
    await moveLane(c.deps, s.id, "a1000000-0000-4000-8000-000000000000", "hold", APPROVER);
    expect(first.state).toBe("cancelled");
    const second = c.pending("hiring_shortlist", s.id)!;
    expect(second.metadata.version).not.toBe(first.metadata.version);
    expect(await approveShortlist(c.deps, s.id, String(first.metadata.version), APPROVER)).toMatchObject({ ok: false });
    expect(await approveShortlist(c.deps, s.id, String(second.metadata.version), APPROVER)).toMatchObject({ ok: true });
    await advanceRequisition(REQ, c.deps);
    expect(c.apps.get("a1000000-0000-4000-8000-000000000000")?.step).toBe("triage");
  });
});

describe("the shortlist, approved and applied", () => {
  it("advances, declines and holds by the rule, then drafts one message per lane move", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "shortlist" });
    c.addApplication({ id: "a1000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.4 });
    c.addApplication({ id: "a2000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 2.1 });
    c.addApplication({ id: "a3000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.9, flags: [{ source: "resume", kind: "instruction", quote: "ignore previous instructions" }] });
    await advanceRequisition(REQ, c.deps);
    const s = [...c.shortlists.values()][0];
    expect(Object.fromEntries(s.items.map((i) => [i.application_id.slice(0, 2), i.lane]))).toEqual({ a1: "advance", a2: "decline", a3: "hold" });
    await approveShortlist(c.deps, s.id, s.version, APPROVER);
    expect(await advanceRequisition(REQ, c.deps)).toMatchObject({ ok: true, next: "collecting" });
    expect(c.apps.get("a1000000-0000-4000-8000-000000000000")?.step).toBe("draft-invite");
    expect(c.apps.get("a2000000-0000-4000-8000-000000000000")?.step).toBe("draft-decline");
    expect(c.apps.get("a3000000-0000-4000-8000-000000000000")?.step).toBe("triage");
    expect(c.shortlists.get(s.id)?.status).toBe("applied");
    // Applying again moves nothing twice.
    c.reqs.get(REQ)!.step = "apply-shortlist";
    c.shortlists.get(s.id)!.status = "approved";
    await advanceRequisition(REQ, c.deps);
    expect(c.stageMoves).toHaveLength(1);
  });

  it("a decline records the rejection before its message goes", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "collecting" });
    c.addApplication({ id: "a2000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "draft-decline" });
    await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps);
    const msg = [...c.messages.values()][0];
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps);
    expect(c.decisions).toEqual([{ applicationId: "a2000000-0000-4000-8000-000000000000", outcome: "rejected", recorded: true }]);
    expect(c.sends).toHaveLength(1);
    expect(c.apps.get("a2000000-0000-4000-8000-000000000000")?.step).toBe("closed");
  });
});

describe("shadow", () => {
  it("proposes and drafts as shadow rows, and asks, sends and moves nothing", async () => {
    const c = fakeChain();
    c.setMode("shadow");
    c.addRequisition({ id: REQ, step: "collecting" });
    for (const [n, rating] of [[1, 4.6], [2, 4.1], [3, 2.0], [4, 1.5], [5, 3.9]] as const) {
      c.addApplication({ id: `a${n}000000-0000-4000-8000-000000000000`, jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: rating });
    }
    const res = await advanceRequisition(REQ, c.deps);
    expect(res).toMatchObject({ ok: true, next: "collecting" });
    expect([...c.shortlists.values()].map((s) => [s.mode, s.status])).toEqual([["shadow", "proposed"]]);
    expect([...c.messages.values()].every((m) => m.mode === "shadow" && m.status === "pending")).toBe(true);
    expect(c.messages.size).toBe(5);
    expect(c.approvals).toHaveLength(0);
    expect(c.sends).toHaveLength(0);
    expect([...c.apps.values()].every((a) => a.step === "triage" && a.status === "active")).toBe(true);
    // The same five are not proposed again on the next tick.
    // A step that proposes nothing answers skipped, which leaves its tick free.
    expect(await advanceRequisition(REQ, c.deps)).toMatchObject({ skipped: expect.stringContaining("Not enough") });
  });

  it("refuses every step that drafts, asks, sends or decides", async () => {
    const c = fakeChain();
    c.setMode("shadow");
    for (const step of ["draft-invite", "send", "ask-decision", "decide"] as const) {
      const id = `s${step.length}000000-0000-4000-8000-00000000000${step.length % 10}`;
      c.addApplication({ id, jobRequisitionId: REQ, step });
      expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: false });
    }
    expect(c.sends).toHaveLength(0);
    expect(c.decisions).toHaveLength(0);
    expect(c.approvals).toHaveLength(0);
  });

  it("still runs the screen, which is advisory, and the open requisition starts collecting", async () => {
    const c = fakeChain();
    c.setMode("shadow");
    c.addRequisition({ id: REQ, step: null, status: "open" });
    c.addApplication({ id: "app00000-0000-4000-8000-000000000011", jobRequisitionId: REQ });
    expect(await advanceApplication("app00000-0000-4000-8000-000000000011", c.deps)).toMatchObject({ ok: true, next: "triage" });
    expect(c.reqs.get(REQ)?.step).toBe("collecting");
  });
});

describe("stopping and closing", () => {
  it("a message the template cannot write stops the run with the reason, and Retry starts it afresh", async () => {
    const c = fakeChain();
    c.setOrgName(null);
    c.addRequisition({ id: REQ, step: "collecting" });
    c.addApplication({ id: "app00000-0000-4000-8000-000000000012", jobRequisitionId: REQ, step: "draft-invite" });
    expect(await advanceApplication("app00000-0000-4000-8000-000000000012", c.deps)).toMatchObject({ ok: false });
    const app = c.apps.get("app00000-0000-4000-8000-000000000012")!;
    expect(app.error).toMatch(/NEXT_PUBLIC_ORG_NAME/);
    const epoch = app.epoch;
    expect(await retryApplication(c.deps, app.id)).toMatchObject({ ok: true });
    expect(app.error).toBeNull();
    expect(app.epoch).not.toBe(epoch);
  });

  it("closing a requisition withdraws every hiring approval pending under it", async () => {
    const c = fakeChain();
    const { msg } = await invitationWaiting(c);
    const { id: decided } = await decisionWaiting(c, "rejected");
    c.addApplication({ id: "a1000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.2 });
    expect(await startShortlist(c.deps, REQ)).toMatchObject({ ok: true });
    await advanceRequisition(REQ, c.deps);
    expect(c.approvals.filter((a) => a.state === "pending").length).toBe(3);
    await closeRequisitionRun(c.deps, REQ, APPROVER);
    expect(c.approvals.filter((a) => a.state === "pending")).toHaveLength(0);
    expect(c.messages.get(msg.id)?.status).toBe("withdrawn");
    expect(c.apps.get(decided)?.step).toBe("closed");
    expect(c.reqs.get(REQ)?.step).toBe("closed");
  });

  it("an archived application leaves the chain and its approval is withdrawn", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    c.apps.get(id)!.archived = true;
    c.apps.get(id)!.step = "draft-invite";
    await advanceApplication(id, c.deps);
    expect(c.apps.get(id)?.step).toBe("closed");
    expect(c.pending("hiring_message", msg.id)).toBeUndefined();
    expect(c.sends).toHaveLength(0);
  });

  it("a recorded decision still tells the candidate when the requisition closes or the application is archived (finding 6)", async () => {
    const c = fakeChain();
    const { id, approval } = await decisionWaiting(c, "hired");
    await approveDecision(c.deps, id, String(approval.metadata.version), APPROVER);
    await advanceApplication(id, c.deps); // decide: recorded, the message is next
    expect(c.apps.get(id)?.step).toBe("send");
    await closeRequisitionRun(c.deps, REQ, APPROVER);
    c.apps.get(id)!.archived = true;
    await advanceApplication(id, c.deps);
    expect(c.sends).toHaveLength(1);
    expect(c.apps.get(id)?.step).toBe("closed");
  });
});

describe("decided by hand (review finding 1)", () => {
  it("never shortlists a candidate a person already hired, rejected or saw withdraw", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "shortlist" });
    c.addApplication({ id: "a1000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.5, status: "rejected" });
    c.addApplication({ id: "a2000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "triage", aiScreenStatus: "done", aiRating: 4.5 });
    await advanceRequisition(REQ, c.deps);
    expect([...c.shortlists.values()][0].items.map((i) => i.application_id)).toEqual(["a2000000-0000-4000-8000-000000000000"]);
  });

  it("the driver's sweep closes such runs, withdrawing what waited, and leaves decide and send alone", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    c.apps.get(id)!.status = "rejected";
    c.addApplication({ id: "a9000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "send", status: "rejected" });
    const { sweepDecidedByHand } = await import("@/entities/hiring/lib/chain/run");
    expect(await sweepDecidedByHand(c.deps)).toBe(1);
    expect(c.apps.get(id)?.step).toBe("closed");
    expect(c.messages.get(msg.id)?.status).toBe("withdrawn");
    expect(c.pending("hiring_message", msg.id)).toBeUndefined();
    expect(c.apps.get("a9000000-0000-4000-8000-000000000000")?.step).toBe("send");
  });

  it("an approved invitation is not sent once a person decided the candidate by hand", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    c.apps.get(id)!.status = "hired";
    await advanceApplication(id, c.deps);
    expect(c.sends).toHaveLength(0);
    expect(c.messages.get(msg.id)?.status).toBe("withdrawn");
  });

  it("a decline is not sent, and nothing overwritten, for a candidate who withdrew", async () => {
    const c = fakeChain();
    c.addRequisition({ id: REQ, step: "collecting" });
    c.addApplication({ id: "a2000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "draft-decline" });
    await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps);
    const msg = [...c.messages.values()][0];
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    c.apps.get("a2000000-0000-4000-8000-000000000000")!.status = "withdrawn";
    await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps);
    expect(c.decisions).toHaveLength(0);
    expect(c.sends).toHaveLength(0);
    expect(c.apps.get("a2000000-0000-4000-8000-000000000000")?.status).toBe("withdrawn");
  });
});

describe("sending safely (review findings 4 and 5)", () => {
  it("records nothing for a decline while email cannot go out", async () => {
    const c = fakeChain();
    c.deps.emailProblem = () => "EMAIL_FROM is not set, so no email has a sender.";
    c.addRequisition({ id: REQ, step: "collecting" });
    c.addApplication({ id: "a2000000-0000-4000-8000-000000000000", jobRequisitionId: REQ, step: "draft-decline" });
    await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps);
    const msg = [...c.messages.values()][0];
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    expect(await advanceApplication("a2000000-0000-4000-8000-000000000000", c.deps)).toMatchObject({ ok: false });
    expect(c.decisions).toHaveLength(0);
    expect(c.apps.get("a2000000-0000-4000-8000-000000000000")?.status).toBe("active");
  });

  it("a send that throws leaves the claim and an unknown outcome; past the duplicate window a person settles it", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    c.deps.send = async () => {
      throw new Error("socket hang up");
    };
    expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: false });
    const stuck = c.messages.get(msg.id)!;
    expect(stuck.status).toBe("sending");
    expect(stuck.error).toMatch(/Outcome unknown/);
    // A day later: never claimed again on its own.
    stuck.claimedAt = "2026-10-01T00:00:00.000Z";
    expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: false, error: expect.stringContaining("24-hour") });
    expect(c.apps.get(id)?.error).toMatch(/mark it sent, or send it again/);
    expect(await settleStuckMessage(c.deps, msg.id, "sent", APPROVER)).toMatchObject({ ok: true });
    expect(c.messages.get(msg.id)?.status).toBe("sent");
    expect(c.apps.get(id)).toMatchObject({ step: "interviewing", error: null });
  });

  it("a send that went back for approval sends under a fresh tick once approved again (finding 2)", async () => {
    const c = fakeChain();
    const { id, msg } = await invitationWaiting(c);
    await approveMessage(c.deps, msg.id, msg.version, APPROVER);
    const before = c.approvals.filter((a) => a.subjectId === msg.id).map((a) => a.id);
    // Withdrawn behind the send's back: the send asks again and sends nothing.
    c.approvals.find((a) => a.subjectId === msg.id && a.state === "approved")!.state = "cancelled";
    expect(await advanceApplication(id, c.deps)).toMatchObject({ ok: true, next: "message-ready" });
    const asked = c.pending("hiring_message", msg.id)!;
    expect(before).not.toContain(asked.id);
    expect(c.sends).toHaveLength(0);
  });
});
