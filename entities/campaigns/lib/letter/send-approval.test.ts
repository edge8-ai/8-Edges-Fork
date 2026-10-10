import { beforeEach, describe, expect, it, vi } from "vitest";
import { approvalsFor, fake, resetApprovalsFake } from "../testing/approvals-fake";

// Y.17, decision Y.54: the letter waits for an approval before it mails the
// list. The ask step builds the list and opens a letter_send approval for one
// version of the letter; Approve decides it for the version the page showed and
// schedules the send with its due time; the send step, run by the driver once
// due, reads the approval row again and releases the letter only if it still
// stands. A cancel before the window is a cancelled row the step reads, and
// nothing goes out. The approvals primitive is an in-memory fake with its
// rules (../testing/approvals-fake); the broadcast's own writes are a store.

vi.mock("@/kernel/approvals/requests", async () => (await import("../testing/approvals-fake")).requestsFake);
vi.mock("@/kernel/approvals/waiting", async () => (await import("../testing/approvals-fake")).waitingFake);
vi.mock("@/kernel/audit/parked-runs", async () => (await import("../testing/approvals-fake")).parksFake);
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

const TUE_FRI = { weekdays: [2, 5], hour: 8 };
const store = vi.hoisted(() => ({
  letter: null as unknown as Record<string, unknown>,
  segment: {} as Record<string, unknown>,
  recipients: 0,
  audienceMatches: 0,
  scheduled: [] as unknown[],
  released: 0,
  cancelled: 0,
  approvedBy: null as string | null,
  editAtLock: null as string | null,
  atLock: null as null | (() => void),
  unlocked: 0,
  failStamp: false,
}));

vi.mock("../broadcasts", () => ({
  getBroadcast: async () => ({ id: "b-1", status: store.letter.status, segment: { ...store.segment }, audienceId: null, brandId: "brand-1" }),
}));
vi.mock("../recipients", () => ({
  materializeRecipients: async () => {
    if (store.audienceMatches === 0) return { ok: false, error: "That segment matches nobody." };
    const added = Math.max(0, store.audienceMatches - store.recipients);
    store.recipients = store.audienceMatches;
    return { ok: true, added };
  },
}));
vi.mock("./data", () => ({
  loadLetter: async () => ({ ok: true, data: { ...store.letter } }),
  setAgentState: async (_id: string, s: { step: string | null; error: string | null }) => {
    store.letter.agentStep = s.step;
    store.letter.agentError = s.error;
    return { ok: true };
  },
  pendingRecipientCount: async () => ({ ok: true, count: store.recipients }),
  pinSendWindow: async (_id: string, segment: Record<string, unknown>, window: unknown) => {
    store.segment = { ...segment, sendWindow: window };
    return { ok: true };
  },
  // The copy freeze: draft -> approved, conditional. `editAtLock` stands for an
  // edit that landed between the version the approver read and the freeze.
  lockLetterCopy: async (_id: string, approvedBy: string) => {
    if (store.editAtLock) {
      store.letter.bodyMd = store.editAtLock;
      store.editAtLock = null;
    }
    store.atLock?.();
    store.atLock = null;
    if (store.letter.status === "draft") {
      store.letter.status = "approved";
      store.approvedBy = approvedBy;
      return { ok: true, locked: true };
    }
    return store.letter.status === "approved" ? { ok: true, locked: false } : { ok: false, error: `The broadcast is ${store.letter.status}` };
  },
  unlockLetterCopy: async () => {
    if (store.letter.status === "approved") store.letter.status = "draft";
    store.unlocked += 1;
    return { ok: true };
  },
  stampLetterSend: async (id: string, window: unknown) => {
    if (store.failStamp) return { ok: false, error: "stamp down" };
    store.scheduled.push({ id, approvedBy: store.approvedBy, window });
    store.letter.agentStep = "scheduled";
    store.letter.scheduledAt = "2026-10-13T01:00:00.000Z";
    return { ok: true, firstSendAt: "2026-10-13T01:00:00.000Z", recipients: store.recipients };
  },
  markLetterReleased: async () => {
    const marked = store.letter.agentStep === "scheduled";
    if (marked) store.letter.agentStep = "released";
    return { ok: true, marked };
  },
  releaseLetter: async () => {
    if (store.letter.status !== "approved") return { ok: true, released: false, status: store.letter.status };
    store.letter.status = "sending";
    store.released += 1;
    return { ok: true, released: true, status: "sending" };
  },
  cancelLetterBroadcast: async () => {
    if (store.letter.status === "draft" || store.letter.status === "approved") store.letter.status = "cancelled";
    store.cancelled += 1;
    return { ok: true };
  },
}));

const { approveSend, cancelSend, letterVersion, rejectSend, runAsk, sendApprovalView, SEND_APPROVER } = await import("./send-approval");
const { letterAwaitsApproval, letterManualStart, letterSentByHand, runSend, withdrawLetterSend } = await import("./send-step");

const by = { personId: "person-1", email: "approver@example.test" };
type Letter = Parameters<typeof runSend>[0];
const letter = () => store.letter as unknown as Letter;

async function ask(): Promise<string> {
  const r = await runAsk({ letter: letter(), profile: {} as never });
  expect(r).toMatchObject({ ok: true });
  store.letter.agentStep = "ready";
  return letterVersion(letter());
}

beforeEach(() => {
  resetApprovalsFake();
  store.letter = {
    id: "b-1", name: "Letter 07", subject: "This week", preheader: "Three posts", bodyMd: "Hello.", blocks: { posts: [], cta: null }, brandId: "brand-1",
    status: "draft", fromEmail: null, replyTo: null, agentStep: "ask", agentError: null, agentStartedAt: "2026-10-09T00:00:00Z", scheduledAt: null, notes: {},
  };
  store.segment = {};
  store.recipients = 0;
  store.audienceMatches = 120;
  store.scheduled = [];
  store.released = 0;
  store.cancelled = 0;
  store.approvedBy = null;
  store.editAtLock = null;
  store.unlocked = 0;
  store.failStamp = false;
});

describe("the ask step", () => {
  it("builds the list, pins the window, opens one approval naming the version, the reach and the window, and parks", async () => {
    const version = await ask();
    expect(store.recipients).toBe(120);
    expect(store.segment).toEqual({ sendWindow: TUE_FRI });
    const rows = approvalsFor("letter_send", "b-1");
    expect(rows).toEqual([expect.objectContaining({ state: "pending", approverPermission: SEND_APPROVER })]);
    expect(rows[0].metadata).toMatchObject({ version, recipients: 120, sendWindow: expect.stringMatching(/Tuesday and Friday at 08:00/), label: 'Send "This week"' });
    expect(fake.parks).toEqual([expect.objectContaining({ routineId: "/api/cron/letter-agent/", status: "waiting" })]);
    expect(store.scheduled).toEqual([]);
  });

  it("stops when nobody can be mailed, asking nothing", async () => {
    store.audienceMatches = 0;
    expect(await runAsk({ letter: letter(), profile: {} as never })).toEqual({ ok: false, error: expect.stringMatching(/^Ask approval: the recipient list could not be built/) });
    expect(approvalsFor("letter_send", "b-1")).toEqual([]);
  });

  it("names on the page the version asked about and the version the letter is at", async () => {
    const version = await ask();
    expect(await sendApprovalView(letter())).toEqual({ pendingVersion: version, currentVersion: version, recipients: 120, sendWindow: expect.any(String) });
  });
});

describe("Approve", () => {
  it("decides the version on the page and schedules the send for its window, sending nothing yet", async () => {
    const version = await ask();
    expect(await approveSend("b-1", version, by)).toEqual({ ok: true });
    expect(approvalsFor("letter_send", "b-1")[0]).toMatchObject({ state: "approved", decidedBy: "person-1" });
    expect(store.scheduled).toEqual([{ id: "b-1", approvedBy: "approver@example.test", window: TUE_FRI }]);
    expect(store.letter.agentStep).toBe("scheduled");
    expect(store.released).toBe(0);
    expect(fake.parks.map((p) => p.status)).toEqual(["ok", "waiting"]);
  });

  it("decides and schedules once on a double click", async () => {
    const version = await ask();
    const [a, b] = await Promise.all([approveSend("b-1", version, by), approveSend("b-1", version, by)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(store.scheduled).toHaveLength(1);
    expect(await approveSend("b-1", version, by)).toEqual({ ok: false, error: "Already approved; the letter is scheduled." });
  });

  it("withdraws an approval asked for an older version and asks again, scheduling nothing", async () => {
    const old = await ask();
    store.letter.bodyMd = "Hello, edited after the ask.";
    const now = letterVersion(letter());
    expect(await approveSend("b-1", now, by)).toEqual({ ok: false, error: expect.stringMatching(/changed after approval was asked for/) });
    expect(approvalsFor("letter_send", "b-1").map((r) => [r.state, r.metadata.version])).toEqual([
      ["cancelled", old],
      ["pending", now],
    ]);
    expect(store.scheduled).toEqual([]);
    expect(await approveSend("b-1", now, by)).toEqual({ ok: true });
  });

  it("refuses a page loaded before an edit", async () => {
    const old = await ask();
    store.letter.subject = "A new subject";
    expect(await approveSend("b-1", old, by)).toEqual({ ok: false, error: expect.stringMatching(/changed since this page loaded/) });
    expect(store.scheduled).toEqual([]);
  });

  it("asks again when the list grew after the approval was asked for", async () => {
    const version = await ask();
    store.audienceMatches = 130;
    store.recipients = 130;
    expect(await approveSend("b-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/recipient list or the send window changed/) });
    expect(approvalsFor("letter_send", "b-1").at(-1)?.metadata.recipients).toBe(130);
    expect(store.scheduled).toEqual([]);
  });
});

describe("Reject", () => {
  it("decides it rejected, cancels the broadcast and closes the run, sending nothing", async () => {
    await ask();
    expect(await rejectSend("b-1", by)).toEqual({ ok: true });
    expect(approvalsFor("letter_send", "b-1")[0]).toMatchObject({ state: "rejected" });
    expect(store.letter).toMatchObject({ status: "cancelled", agentStep: "rejected" });
    expect(fake.parks[0]).toMatchObject({ status: "ok", summary: "rejected" });
    expect(store.scheduled).toEqual([]);
  });
});

describe("the send step", () => {
  async function scheduled(): Promise<void> {
    const version = await ask();
    expect(await approveSend("b-1", version, by)).toEqual({ ok: true });
  }
  const due = new Date("2026-10-13T02:00:00Z");

  it("releases an approved letter to the send once it is due, and closes the wait", async () => {
    await scheduled();
    expect(await runSend(letter(), due)).toEqual({ ok: true, next: "released", summary: expect.stringMatching(/Released to the send routine/) });
    expect(store.released).toBe(1);
    expect(fake.parks.at(-1)).toMatchObject({ status: "ok", summary: "released to the send" });
  });

  it("sends nothing before its due time", async () => {
    await scheduled();
    expect(await runSend(letter(), new Date("2026-10-12T00:00:00Z"))).toEqual({ ok: false, error: "Send: not due until 2026-10-13T01:00:00.000Z." });
    expect(store.released).toBe(0);
  });

  it("sends nothing after a cancel before the window: the cancelled row is what it reads", async () => {
    await scheduled();
    expect(await cancelSend("b-1", by, "the broadcast was cancelled")).toEqual({ ok: true });
    expect(approvalsFor("letter_send", "b-1").map((r) => r.state)).toEqual(["approved", "cancelled"]);
    expect(store.letter.agentStep).toBe("cancelled");
    expect(fake.parks.at(-1)).toMatchObject({ status: "skipped", summary: "the broadcast was cancelled" });
    // Even had the broadcast's own status write been lost, the step reads the row.
    store.letter.agentStep = "scheduled";
    expect(await runSend(letter(), due)).toMatchObject({ ok: true, next: "cancelled" });
    expect(store.released).toBe(0);
    expect(store.letter.status).toBe("cancelled");
  });

  it("is done when a person already started the send by hand", async () => {
    await scheduled();
    store.letter.status = "sending";
    expect(await runSend(letter(), due)).toMatchObject({ ok: true, next: "released", summary: expect.stringMatching(/by hand/) });
    expect(store.released).toBe(0);
  });

  it("releases nothing when the letter is not the version approved", async () => {
    await scheduled();
    store.letter.bodyMd = "Changed under the approval.";
    expect(await runSend(letter(), due)).toEqual({ ok: false, error: "Send: the letter is not the version that was approved; nothing was sent." });
    expect(store.released).toBe(0);
  });
});

describe("the broadcast's own buttons", () => {
  it("the plain Approve refuses a letter at ready, and lets a broadcast the agent never ran on through", async () => {
    await ask();
    expect(await letterAwaitsApproval("b-1")).toMatch(/waits on its send approval/);
    store.letter.agentStep = null;
    store.letter.agentStartedAt = null;
    expect(await letterAwaitsApproval("b-1")).toBeNull();
  });

  it("Cancel withdraws the letter's approval and answers nothing when that worked", async () => {
    await ask();
    expect(await withdrawLetterSend("b-1", by, "the broadcast was cancelled")).toBeNull();
    expect(approvalsFor("letter_send", "b-1").map((r) => r.state)).toEqual(["cancelled"]);
  });
});

describe("cancel while waiting on the approval", () => {
  it("withdraws the pending approval and closes the run", async () => {
    await ask();
    expect(await cancelSend("b-1", by, "the run was stopped")).toEqual({ ok: true });
    expect(approvalsFor("letter_send", "b-1").map((r) => r.state)).toEqual(["cancelled"]);
    expect(store.letter.agentStep).toBe("cancelled");
  });

  it("writes nothing for a broadcast with no approval on record", async () => {
    store.letter.agentStep = null;
    expect(await cancelSend("b-1", by, "the broadcast was cancelled")).toEqual({ ok: true });
    expect(approvalsFor("letter_send", "b-1")).toEqual([]);
    expect(store.letter.agentStep).toBeNull();
  });
});

// The Opus review of #1988, findings 3, 4 and 5.
describe("the review's letter findings", () => {
  async function scheduled(): Promise<void> {
    const version = await ask();
    expect(await approveSend("b-1", version, by)).toEqual({ ok: true });
  }

  it("3a: freezes the copy before deciding, and decides nothing when an edit landed in between", async () => {
    const version = await ask();
    store.editAtLock = "Edited between the page and the click.";
    expect(await approveSend("b-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/changed as you approved it/) });
    expect(approvalsFor("letter_send", "b-1")[0]).toMatchObject({ state: "pending" });
    expect(store.letter.status).toBe("draft");
    expect(store.unlocked).toBe(1);
    expect(store.scheduled).toEqual([]);
  });

  it("3a: decides only the row and version checked, thawing the copy when that row was asked again", async () => {
    const version = await ask();
    // Another ask refreshes the pending row's version after the checks passed,
    // as the copy is being frozen: the decision is bound to what was checked.
    const row = approvalsFor("letter_send", "b-1")[0];
    store.atLock = () => {
      row.metadata.version = "ffffffffffff";
    };
    const r = await approveSend("b-1", version, by);
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/decided or asked again a moment ago/) });
    expect(approvalsFor("letter_send", "b-1").some((a) => a.state === "approved")).toBe(false);
    expect(store.letter.status).toBe("draft");
  });

  it("3: Start sending refuses a letter at ready, and a scheduled one that is not the version approved", async () => {
    await ask();
    expect(await letterManualStart("b-1")).toMatch(/waits on its send approval/);
    store.letter.agentStep = "scheduled";
    store.letter.status = "approved";
    expect(await letterManualStart("b-1")).toMatch(/the approval is pending/);
  });

  it("3: Start sending a scheduled letter early closes its run, so the driver never releases it again after a Pause", async () => {
    await scheduled();
    expect(await letterManualStart("b-1")).toBeNull();
    store.letter.status = "sending";
    expect(await letterSentByHand("b-1")).toBeNull();
    expect(store.letter.agentStep).toBe("released");
    expect(fake.parks.at(-1)).toMatchObject({ status: "ok", summary: "started by hand" });
    // A Pause puts the broadcast back to approved; the run is past its send.
    store.letter.status = "approved";
    expect(await letterSentByHand("b-1")).toBeNull();
    expect(store.letter.agentStep).toBe("released");
  });

  it("4: the plain Approve refuses any broadcast the letter agent ran on, after a Stop or mid-run too", async () => {
    store.letter.agentStep = null;
    expect(await letterAwaitsApproval("b-1")).toMatch(/run the agent to ready/);
    store.letter.agentStep = "write";
    expect(await letterAwaitsApproval("b-1")).toMatch(/run the agent to ready/);
    store.letter.agentStartedAt = null;
    store.letter.agentStep = null;
    expect(await letterAwaitsApproval("b-1")).toBeNull();
  });

  it("5: Approve again resumes a schedule that failed after the decision, with the broadcast already approved", async () => {
    const version = await ask();
    store.failStamp = true;
    expect(await approveSend("b-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/Approve again to resume/) });
    expect(store.letter).toMatchObject({ status: "approved", agentStep: "ready" });
    // An unstamped list is not mailed by hand meanwhile.
    expect(await letterManualStart("b-1")).toMatch(/waits on its send approval/);
    store.failStamp = false;
    expect(await approveSend("b-1", version, by)).toEqual({ ok: true });
    expect(store.letter.agentStep).toBe("scheduled");
    expect(approvalsFor("letter_send", "b-1").filter((a) => a.state === "approved")).toHaveLength(1);
  });
});

// The re-review of #1988, blocker 2 and race 4.
describe("the re-review's letter findings", () => {
  it("2: a Stop after a half-done schedule thaws the copy, and Start sending refuses the stopped letter", async () => {
    const version = await ask();
    store.failStamp = true;
    await approveSend("b-1", version, by);
    expect(store.letter).toMatchObject({ status: "approved", agentStep: "ready" });
    // Stop: the approval is cancelled and the frozen copy goes back to a draft.
    expect(await cancelSend("b-1", by, "the run was stopped")).toEqual({ ok: true });
    expect(store.letter.status).toBe("draft");
    expect(approvalsFor("letter_send", "b-1").map((a) => a.state)).toEqual(["approved", "cancelled"]);
    // Had the thaw been lost and the step cleared, Start sending still refuses
    // a letter the agent ran on that has no scheduled send.
    Object.assign(store.letter, { status: "approved", agentStep: null });
    expect(await letterManualStart("b-1")).toMatch(/has no scheduled send/);
  });

  it("2: Start sending passes a released letter and a broadcast the agent never ran on", async () => {
    Object.assign(store.letter, { agentStep: "released", status: "approved" });
    expect(await letterManualStart("b-1")).toBeNull();
    Object.assign(store.letter, { agentStep: null, agentStartedAt: null });
    expect(await letterManualStart("b-1")).toBeNull();
  });

  it("4: a press that loses the decision to a press of the same version does not thaw the copy", async () => {
    const version = await ask();
    const row = approvalsFor("letter_send", "b-1")[0];
    // The other press decides this version while this one freezes the copy.
    store.atLock = () => {
      Object.assign(row, { state: "approved", decidedBy: "person-2" });
    };
    expect(await approveSend("b-1", version, by)).toEqual({ ok: false, error: expect.stringMatching(/approved a moment ago, by another press/) });
    expect(store.unlocked).toBe(0);
    expect(store.letter.status).toBe("approved");
  });
});
