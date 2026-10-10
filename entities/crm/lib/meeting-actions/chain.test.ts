import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.13: the meeting-to-actions run, step by step, on the in-memory store
// (testing/chain-fake.ts). The chain's own code runs unchanged; its data
// modules, the approvals primitive, the ledger, the recorder (which refuses a
// tick that passed, as claim_tick does), the switch, the senders and the two
// model calls are the fakes. Spec section 12, tests 1, 3, 6, 7, 8, 9 and 15.

vi.mock("./data", async () => (await import("./testing/chain-fake")).fakeData);
vi.mock("./items", async () => (await import("./testing/chain-fake")).fakeItems);
vi.mock("./sources", async () => (await import("./testing/chain-fake")).fakeSources);
vi.mock("./ai", async () => (await import("./testing/chain-fake")).fakeAi);
vi.mock("@/kernel/approvals/requests", async () => (await import("./testing/chain-fake")).fakeRequests);
vi.mock("@/kernel/approvals/waiting", async () => (await import("./testing/chain-fake")).fakeWaiting);
vi.mock("@/kernel/audit/run-context", async () => (await import("./testing/chain-fake")).fakeRunContext);
vi.mock("@/kernel/audit/routine-runs", async () => (await import("./testing/chain-fake")).fakeRoutineRuns);
vi.mock("@/kernel/audit/effects", async () => (await import("./testing/chain-fake")).fakeEffects);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("./testing/chain-fake")).fakeParked);
vi.mock("@/kernel/messaging/email", async () => (await import("./testing/chain-fake")).fakeEmail);
vi.mock("@/kernel/messaging/lark-api", async () => (await import("./testing/chain-fake")).fakeLarkApi);
vi.mock("@/kernel/identity/people-holding", async () => (await import("./testing/chain-fake")).fakePeopleHolding);
vi.mock("@/kernel/config/site-origin", async () => (await import("./testing/chain-fake")).fakeSiteOrigin);

const fake = await import("./testing/chain-fake");
const { store, resetStore, seedMeeting, MEETING, COMPANY, OWNER, CONTACT_ONE, CONTACT_TWO } = fake;
const { advanceFollowup, expireUndecided, meetingActionsDriven, openReadyRuns, runFollowupStepNow } = await import("./run");
const { approveFollowup, retryMeetingRun, startMeetingRun } = await import("./decide");
const { CARDS_ONLY_REASON } = await import("./steps");

const owner = { personId: OWNER, email: "account.owner@agency.example.test" };

function runOf(meetingId = MEETING) {
  const r = [...store.runs.values()].find((x) => x.meetingId === meetingId);
  if (!r) throw new Error("no run");
  return r;
}

/** Run the step the run is at until it parks, closes or a step fails; the last result. */
async function drive(id: string) {
  let last: Awaited<ReturnType<typeof runFollowupStepNow>> | null = null;
  for (let i = 0; i < 10; i++) {
    last = await runFollowupStepNow(id);
    if ("skipped" in last || !last.ok || !["gather", "extract", "draft", "ask", "send"].includes(last.next)) break;
  }
  return last;
}

async function startAndDrive() {
  const started = await startMeetingRun(MEETING);
  expect(started).toEqual({ ok: true });
  await drive(runOf().id);
  return runOf();
}

beforeEach(() => {
  resetStore();
  seedMeeting();
});

describe("a live run to the approval", () => {
  it("files Edge8's quoted actions, keeps the client's, drafts for the attendees, and parks on one approval with one DM", async () => {
    const run = await startAndDrive();
    expect(run.step).toBe("ready");
    expect(run.mode).toBe("live");
    const edge8 = store.items.filter((i) => i.ownerSide !== "client");
    expect(edge8.map((i) => [i.title, i.fileState, i.ownerName])).toEqual([
      ["Send the pilot data checklist", "to_file", "Delivery Lead"],
      ["Book the finance team's training", "to_file", "Account Owner"],
    ]);
    expect(store.items.filter((i) => i.ownerSide === "client").map((i) => i.fileState)).toEqual(["client"]);
    expect(run.toPersonIds.sort()).toEqual([CONTACT_ONE, CONTACT_TWO].sort());
    expect(run.approverPersonId).toBe(OWNER);
    expect(run.commitments).toEqual(["A scope for the second pilot was promised for next week."]);
    expect(run.aiBodyMd).toBe(run.bodyMd);
    expect(store.approvals).toHaveLength(1);
    expect(store.approvals[0]).toMatchObject({ state: "pending", approverPersonId: OWNER, metadata: { version: run.version, recipients: 2, meetingId: MEETING, cardsFiled: 2 } });
    expect(store.dms).toHaveLength(1);
    expect(store.dms[0].text).toContain(`/team/revenue/meetings/${MEETING}`);
    expect(store.emails).toHaveLength(0);
  });
});

describe("test 1: an idempotent re-run", () => {
  it("asks the model once when extract runs again after its items were written", async () => {
    await startAndDrive();
    const before = store.items.length;
    const run = runOf();
    // A retry of extract under a fresh start, as after a crash before the step advanced.
    store.runs.set(run.id, { ...run, step: "extract", startedAt: "2026-10-09T05:00:00.000Z" });
    const again = await advanceFollowup(run.id);
    expect(again).toMatchObject({ ok: true, next: "draft" });
    expect(store.aiCalls.extract).toBe(1);
    expect(store.items).toHaveLength(before);
  });

  it("sends once, and a crash after the send re-sends under the same key, which the provider answers without a second email", async () => {
    const run = await startAndDrive();
    store.failSentAtWrite = true;
    const first = await approveFollowup(run.id, run.version as string, owner);
    expect(first.ok).toBe(false);
    expect(runOf().step).toBe("send");
    expect(runOf().sendClaimedAt).not.toBeNull();
    // The driver's next attempt at the same (errored, so unpassed) tick.
    const retried = await runFollowupStepNow(run.id);
    expect(retried).toMatchObject({ ok: true, next: "sent" });
    expect(store.emails.map((e) => e.idempotencyKey)).toEqual([`crm:followup:${MEETING}`, `crm:followup:${MEETING}`]);
    expect(runOf().step).toBe("sent");
    // And nothing more: a sent run is at no step.
    expect(await advanceFollowup(run.id)).toMatchObject({ skipped: expect.stringContaining("sent") });
    expect(store.emails).toHaveLength(2);
  });
});

describe("test 3: a failed AI call leaves no effect", () => {
  it("writes no item, opens no approval, sends nothing, and records the step's error", async () => {
    store.extract = new Error("model overloaded");
    await startMeetingRun(MEETING);
    const r = await drive(runOf().id);
    expect(r).toMatchObject({ ok: false, step: "extract" });
    expect(runOf().step).toBe("extract");
    expect(store.items).toHaveLength(0);
    expect(store.approvals).toHaveLength(0);
    expect(store.dms).toHaveLength(0);
    expect(store.emails).toHaveLength(0);
  });

  it("test 15: the driver's give-up stops the run, and Retry starts the step afresh and goes on", async () => {
    store.extract = new Error("model overloaded");
    await startMeetingRun(MEETING);
    await drive(runOf().id);
    await meetingActionsDriven.giveUp(runOf().id, "extract", "Stopped after 3 failed attempts at this step. Last: model overloaded");
    expect(runOf()).toMatchObject({ step: "stopped", error: expect.stringContaining("3 failed attempts") });
    store.extract = structuredClone(fake.EXTRACTED);
    const startedBefore = runOf().startedAt;
    expect(await retryMeetingRun(runOf().id)).toEqual({ ok: true });
    expect(runOf().startedAt).not.toBe(startedBefore);
    await drive(runOf().id);
    expect(runOf().step).toBe("ready");
  });
});

describe("test 6 and 7: what the transcript cannot do", () => {
  it("drops an action whose quote is not in the transcript, and an injected line changes no recipient", async () => {
    const run = await startAndDrive();
    expect(store.items.map((i) => i.title)).not.toContain("Wire the deposit to the new account");
    expect(run.toPersonIds.sort()).toEqual([CONTACT_ONE, CONTACT_TWO].sort());
    const approved = await approveFollowup(run.id, run.version as string, owner);
    expect(approved).toEqual({ ok: true });
    expect(store.emails[0].to.sort()).toEqual(["contact.one@example-client.test", "contact.two@example-client.test"]);
    expect(store.emails[0].from).toBeUndefined();
    expect(store.emails[0].replyTo).toBe("account.owner@agency.example.test");
  });

  it("fails the draft that carries an address or a foreign link, and asks nobody", async () => {
    store.draft = { ...fake.DRAFTED, body_md: `${fake.DRAFTED.body_md}\n\nWrite to someone@elsewhere.test or see https://elsewhere.test/x.` };
    await startMeetingRun(MEETING);
    const r = await drive(runOf().id);
    expect(r).toMatchObject({ ok: false, step: "draft", error: expect.stringContaining("email address") });
    expect(store.approvals).toHaveLength(0);
  });
});

describe("test 8: which meetings open a run", () => {
  it("opens one only for a ready, in-scope meeting written after the start; the button opens one for any client meeting", async () => {
    const base = { companyId: COMPANY, archivedAt: null, summary: "s", aiStatus: "ready", lifecycleStage: "customer", meetingType: "General", createdAt: "2026-10-09T03:00:00.000Z" };
    const ids = Array.from({ length: 7 }, (_, i) => `55555555-5555-4555-8555-55555555555${i}`);
    store.candidates = [
      { ...base, id: ids[0], meetingType: "Sales" },
      { ...base, id: ids[1], lifecycleStage: "lead" },
      { ...base, id: ids[2], aiStatus: "pending" },
      { ...base, id: ids[3], aiStatus: "failed" },
      { ...base, id: ids[4], archivedAt: "2026-10-09T04:00:00.000Z" },
      { ...base, id: ids[5], createdAt: "2026-10-01T00:00:00.000Z" },
      { ...base, id: ids[6], aiStatus: null },
    ];
    const opened = await openReadyRuns();
    expect(opened.opened).toHaveLength(1);
    expect([...store.runs.values()].map((r) => r.meetingId)).toEqual([ids[6]]);

    seedMeeting({ meetingType: "Sales", createdAt: "2026-09-01T00:00:00.000Z" });
    expect(await startMeetingRun(MEETING)).toEqual({ ok: true });
    expect(runOf().meetingId).toBe(MEETING);
  });

  it("opens nothing while the chain's switch is off", async () => {
    store.switchMode = "paused";
    store.candidates = [{ id: MEETING, companyId: COMPANY, archivedAt: null, summary: "s", aiStatus: "ready", lifecycleStage: "customer", meetingType: "General", createdAt: "2026-10-09T03:00:00.000Z" }];
    expect(await openReadyRuns()).toMatchObject({ opened: [], skipped: expect.any(String) });
  });

  it("files a Team Ceremony's cards and sends it no email", async () => {
    seedMeeting({ meetingType: "Team Ceremony" });
    const run = await startAndDrive();
    expect(run).toMatchObject({ step: "skipped", skipReason: CARDS_ONLY_REASON });
    expect(store.items.filter((i) => i.fileState === "to_file")).toHaveLength(2);
    expect(store.aiCalls.draft).toBe(0);
    expect(store.approvals).toHaveLength(0);
  });
});

describe("test 9: shadow", () => {
  it("proposes the items, drafts, and asks, tells and sends nothing", async () => {
    store.switchMode = "shadow";
    await startMeetingRun(MEETING);
    expect(runOf().mode).toBe("shadow");
    await drive(runOf().id);
    const run = runOf();
    expect(run.step).toBe("shadowed");
    expect(store.items.filter((i) => i.ownerSide !== "client").every((i) => i.fileState === "proposed")).toBe(true);
    expect(store.aiCalls.draft).toBe(1);
    expect(store.approvals).toHaveLength(0);
    expect(store.dms).toHaveLength(0);
    expect(store.emails).toHaveLength(0);
    expect([...store.parked.keys()]).toHaveLength(0);
  });

  it("turns a live run that meets a shadow tick into a shadow run for good", async () => {
    await startMeetingRun(MEETING);
    store.switchMode = "shadow";
    await drive(runOf().id);
    expect(runOf()).toMatchObject({ mode: "shadow", step: "shadowed" });
    expect(store.approvals).toHaveLength(0);
  });
});

describe("test 12: expiry", () => {
  it("withdraws an approval nobody decided within 7 days, closes the wait, and sends nothing", async () => {
    const run = await startAndDrive();
    store.runs.set(run.id, { ...runOf(), updatedAt: "2026-10-01T00:00:00.000Z" });
    const out = await expireUndecided(new Date("2026-10-09T00:00:00.000Z"));
    expect(out).toEqual({ expired: [run.id], failures: [] });
    expect(runOf().step).toBe("expired");
    expect(store.approvals[0].state).toBe("cancelled");
    expect([...store.parked.values()]).toEqual(["skipped"]);
    expect(store.emails).toHaveLength(0);
  });
});

describe("a send that never recorded how it ended (review 1)", () => {
  async function crashAfterSend() {
    const run = await startAndDrive();
    store.failSentAtWrite = true;
    await approveFollowup(run.id, run.version as string, owner);
    expect(runOf()).toMatchObject({ step: "send", sentAt: null });
    expect(store.emails).toHaveLength(1);
    return run;
  }

  it("records the send and mails nothing when the CRM log holds it", async () => {
    const run = await crashAfterSend();
    store.logged.add(`${MEETING}|crm:followup:${MEETING}`);
    const r = await runFollowupStepNow(run.id);
    expect(r).toMatchObject({ ok: true, next: "sent", summary: expect.stringContaining("CRM timeline") });
    expect(runOf().sentAt).not.toBeNull();
    expect(store.emails).toHaveLength(1);
  });

  it("stops instead of resending once the provider has forgotten the key, and sends again only on Retry", async () => {
    const run = await crashAfterSend();
    store.runs.set(run.id, { ...runOf(), sendClaimedAt: new Date(Date.now() - 24 * 3600_000).toISOString() });
    const r = await runFollowupStepNow(run.id);
    expect(r).toMatchObject({ ok: true, next: "stopped" });
    expect(runOf()).toMatchObject({ step: "stopped", error: expect.stringContaining("may have gone") });
    expect(store.emails).toHaveLength(1);
    // A person checked and pressed Retry: the claim starts afresh and the email goes.
    expect(await retryMeetingRun(run.id)).toEqual({ ok: true });
    expect(runOf().step).toBe("sent");
    expect(store.emails).toHaveLength(2);
  });

  it("resends under the same key inside the window when nothing is logged", async () => {
    const run = await crashAfterSend();
    const r = await runFollowupStepNow(run.id);
    expect(r).toMatchObject({ ok: true, next: "sent" });
    expect(store.emails.map((e) => e.idempotencyKey)).toEqual([`crm:followup:${MEETING}`, `crm:followup:${MEETING}`]);
  });
});

describe("the transcript screen (review 2)", () => {
  it("screens the transcript before the model, wraps it under a nonce, and keeps the flags for the approver", async () => {
    await startAndDrive();
    const input = store.extractInputs[0] as { screened: { text: string; nonce: string; flags: { kind: string; line: number }[] } };
    expect(input.screened.text).toContain(`<untrusted_transcript id="${input.screened.nonce}">`);
    expect(input.screened.text).toContain("[L1] Delivery Lead:");
    const record = store.screens.get(MEETING);
    expect(record?.flags.map((f) => [f.line, f.kind])).toEqual(
      expect.arrayContaining([
        [4, "override"],
        [4, "foreign-link"],
      ]),
    );
    // The client's own domain is no foreign link.
    expect(record?.flags.some((f) => f.line !== 4)).toBe(false);
  });
});

