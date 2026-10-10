import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.13: what a person does to a follow-up on the meeting page, on the same
// in-memory store as chain.test.ts. Spec section 12, tests 2, 4 and 5, and the
// approver rule (decision 4).

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
const { store, resetStore, seedMeeting, MEETING, OWNER, CONTACT_ONE, CONTACT_THREE } = fake;
const { advanceFollowup, runFollowupStepNow } = await import("./run");
const { approveFollowup, markProposedItem, markShadowDraft, rejectFollowup, saveFollowupDraft, startMeetingRun } = await import("./decide");

const owner = { personId: OWNER, email: "account.owner@agency.example.test" };
const someoneElse = { personId: "66666666-6666-4666-8666-666666666666", email: "another.revenue@agency.example.test" };

function runOf() {
  const r = [...store.runs.values()].find((x) => x.meetingId === MEETING);
  if (!r) throw new Error("no run");
  return r;
}

async function toReady() {
  await startMeetingRun(MEETING);
  for (let i = 0; i < 10 && ["gather", "extract", "draft", "ask"].includes(runOf().step); i++) await runFollowupStepNow(runOf().id);
  expect(runOf().step).toBe("ready");
  return runOf();
}

beforeEach(() => {
  resetStore();
  seedMeeting();
});

describe("test 2: a rejected approval never sends", () => {
  it("closes the run rejected with nothing sent, whatever step is tried after, and leaves the items", async () => {
    const run = await toReady();
    const items = structuredClone(store.items);
    expect(await rejectFollowup(run.id, owner, "Too early; I will call them.")).toEqual({ ok: true });
    expect(runOf().step).toBe("rejected");
    expect(store.approvals[0]).toMatchObject({ state: "rejected", reason: "Too early; I will call them." });
    expect([...store.parked.values()]).toEqual(["ok"]);
    expect(await advanceFollowup(run.id)).toMatchObject({ skipped: expect.any(String) });
    expect(await runFollowupStepNow(run.id)).toMatchObject({ skipped: expect.any(String) });
    expect(await approveFollowup(run.id, run.version as string, owner)).toMatchObject({ ok: false });
    // Even a run forced to the send step finds no approval for its version.
    store.runs.set(run.id, { ...runOf(), step: "send" });
    await advanceFollowup(run.id);
    expect(store.emails).toHaveLength(0);
    expect(store.items).toEqual(items);
  });
});

describe("test 4: an edit after the ask is a new version", () => {
  it("withdraws the old approval, asks for the new one, refuses the old version, and sends the new one once approved", async () => {
    const run = await toReady();
    const v1 = run.version as string;
    const saved = await saveFollowupDraft(run.id, { subject: run.subject as string, bodyMd: `${run.bodyMd}\n\nP.S. Thank you for hosting.`, toPersonIds: [CONTACT_ONE] }, owner);
    expect(saved.ok).toBe(true);
    const v2 = runOf().version as string;
    expect(v2).not.toBe(v1);
    expect(runOf()).toMatchObject({ step: "ready", toPersonIds: [CONTACT_ONE] });
    // The model's draft stays as it was: the learning example.
    expect(runOf().aiBodyMd).toBe(fake.DRAFTED.body_md);
    expect(store.approvals.map((a) => [a.state, a.metadata.version])).toEqual([
      ["cancelled", v1],
      ["pending", v2],
    ]);
    expect([...store.parked.values()].sort()).toEqual(["skipped", "waiting"]);
    // One DM per meeting, however often it is asked.
    expect(store.dms).toHaveLength(1);

    expect(await approveFollowup(run.id, v1, owner)).toMatchObject({ ok: false, error: expect.stringContaining("changed") });
    expect(store.emails).toHaveLength(0);
    expect(await approveFollowup(run.id, v2, owner)).toEqual({ ok: true });
    expect(store.emails).toHaveLength(1);
    expect(store.emails[0].to).toEqual(["contact.one@example-client.test"]);
  });

  it("refuses a recipient who is not a contact of this client, and a body carrying an address", async () => {
    const run = await toReady();
    const stranger = "77777777-7777-4777-8777-777777777777";
    expect(await saveFollowupDraft(run.id, { subject: "s", bodyMd: "b", toPersonIds: [stranger] }, owner)).toMatchObject({ ok: false });
    expect(await saveFollowupDraft(run.id, { subject: "s", bodyMd: "Write to a.person@elsewhere.test", toPersonIds: [CONTACT_THREE] }, owner)).toMatchObject({ ok: false });
    expect(runOf().version).toBe(run.version);
  });

  it("sends nothing when what would go out no longer matches the approved version, and asks again", async () => {
    const run = await toReady();
    expect(await approveFollowup(run.id, run.version as string, owner)).toEqual({ ok: true });
    expect(store.emails).toHaveLength(1);
    // A second run of the same meeting's send, after a contact's address changed in the CRM.
    store.runs.set(run.id, { ...runOf(), step: "send", sentAt: null, sendClaimedAt: null, startedAt: "2026-10-09T09:00:00.000Z" });
    store.contacts.set(fake.COMPANY, store.contacts.get(fake.COMPANY)!.map((c) => (c.personId === CONTACT_ONE ? { ...c, email: "new.address@example-client.test" } : c)));
    const r = await advanceFollowup(run.id);
    expect(r).toMatchObject({ ok: true, next: "ask" });
    expect(store.emails).toHaveLength(1);
  });
});

describe("test 5: two presses at once", () => {
  it("decides once and sends once", async () => {
    const run = await toReady();
    const [a, b] = await Promise.all([approveFollowup(run.id, run.version as string, owner), approveFollowup(run.id, run.version as string, owner)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(store.emails).toHaveLength(1);
    expect(runOf().step).toBe("sent");
  });
});

describe("who decides (decision 4)", () => {
  it("lets only the meeting's owner decide a follow-up addressed to them", async () => {
    const run = await toReady();
    expect(await approveFollowup(run.id, run.version as string, someoneElse)).toMatchObject({ ok: false, error: expect.stringContaining("owner") });
    expect(await rejectFollowup(run.id, someoneElse, null)).toMatchObject({ ok: false });
    expect(store.emails).toHaveLength(0);
  });

  it("addresses the approval to crm.calls when the owner does not hold it, and then any holder decides", async () => {
    store.holders = [];
    const run = await toReady();
    expect(run.approverPersonId).toBeNull();
    expect(store.dms).toHaveLength(0);
    expect(await approveFollowup(run.id, run.version as string, someoneElse)).toEqual({ ok: true });
    expect(store.emails[0].replyTo).toBe("another.revenue@agency.example.test");
  });
});

describe("the shadow marks", () => {
  it("marks a proposed item and a shadowed draft, and nothing else", async () => {
    store.switchMode = "shadow";
    await startMeetingRun(MEETING);
    for (let i = 0; i < 10 && ["gather", "extract", "draft"].includes(runOf().step); i++) await runFollowupStepNow(runOf().id);
    const proposed = store.items.find((i) => i.fileState === "proposed")!;
    const client = store.items.find((i) => i.fileState === "client")!;
    expect(await markProposedItem(proposed.id, "useful")).toEqual({ ok: true });
    expect(await markProposedItem(client.id, "useful")).toMatchObject({ ok: false });
    expect(await markShadowDraft(MEETING, "would_send")).toEqual({ ok: true });
    expect(runOf().shadowVerdict).toBe("would_send");
  });
});
