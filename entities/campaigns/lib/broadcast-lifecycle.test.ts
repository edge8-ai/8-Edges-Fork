import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, tick, timeline } from "@/kernel/data/testing/fake-company-os";

// A.44: one module owns a broadcast's lifecycle by hand. The table below is
// written out by hand rather than read from BROADCAST_TRANSITIONS, so a change
// to an allowed-from set has to change this test too. BUG-2 was a cancel that
// wrote "cancelled" before withdrawing the letter's send: a failed withdraw
// left a cancelled row whose approval still stood. The withdraw now comes
// first, and a failure writes nothing.
//
// A.55: Approve is the sixth verb, and the letter's driver and the send
// routine move the status through the same write as routines. Approve wrote on
// its own before and never counted the rows it changed, so a Cancel landing
// between its check and its write left it answering ok and auditing an
// approval of a broadcast it never moved.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const audits = vi.hoisted(() => [] as unknown[]);
vi.mock("@/kernel/audit/audit", () => ({
  recordAudit: vi.fn(async (entry: unknown) => {
    audits.push(entry);
  }),
}));
const letter = vi.hoisted(() => ({
  withdrawRefusal: null as string | null,
  startRefusal: null as string | null,
  unclosed: null as string | null,
  awaitsRefusal: null as string | null,
  events: [] as { at: number; label: string }[],
}));
vi.mock("./letter/send-step", () => ({
  withdrawLetterSend: async () => {
    letter.events.push({ at: tick(), label: "withdraw" });
    return letter.withdrawRefusal;
  },
  letterManualStart: async () => {
    letter.events.push({ at: tick(), label: "manualStart" });
    return letter.startRefusal;
  },
  letterSentByHand: async () => {
    letter.events.push({ at: tick(), label: "sentByHand" });
    return letter.unclosed;
  },
  letterAwaitsApproval: async () => {
    letter.events.push({ at: tick(), label: "awaitsApproval" });
    return letter.awaitsRefusal;
  },
}));
// Approve's own checks run for real (./broadcast-approve); what they read is
// stubbed at its source: the broadcast, the audience rebuild and the window stamp.
const draft = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  materialized: 0,
  stampError: null as string | null,
}));
const DRAFT = { id: "b-1", status: "draft", bodyMd: "Hello.", audienceId: null, seriesId: null, scheduledAt: null, segment: {} };
vi.mock("./broadcasts", () => ({ getBroadcast: async () => draft.row }));
vi.mock("./recipients", () => ({
  materializeRecipients: async () => {
    draft.materialized += 1;
    return { ok: true, added: 0 };
  },
}));
vi.mock("./series-template", () => ({ INTRO_MARKER: "[Write this week's intro]" }));
vi.mock("./send-window-stamp", () => ({
  stampSendWindow: async () => {
    letter.events.push({ at: tick(), label: "stamp" });
    if (draft.stampError) return { ok: false, error: draft.stampError };
    return { ok: true, summary: { stamped: 2, sources: { timezone: 2, city: 0, country: 0, default: 0 } } };
  },
}));

const { approveBroadcastRow, cancelBroadcastRow, deleteBroadcastRow, markBroadcastMissedRow, pauseBroadcastRow, startBroadcast } = await import("./broadcast-lifecycle");
const { BROADCAST_TRANSITIONS, moveByRoutine } = await import("./broadcast-transitions");

const by = { personId: "person-1", email: "admin@example.test" };
const STATUSES = ["draft", "approved", "sending", "sent", "cancelled", "missed"] as const;
type Status = (typeof STATUSES)[number];

const VERBS = {
  approve: { run: approveBroadcastRow, allowed: ["draft"], to: () => "approved" },
  cancel: { run: cancelBroadcastRow, allowed: ["draft", "approved"], to: () => "cancelled" },
  delete: { run: deleteBroadcastRow, allowed: ["draft", "approved", "cancelled", "missed", "sent"], to: (s: Status) => (s === "sent" ? "sent" : "cancelled") },
  start: { run: startBroadcast, allowed: ["approved"], to: () => "sending" },
  pause: { run: pauseBroadcastRow, allowed: ["sending"], to: () => "approved" },
  missed: { run: markBroadcastMissedRow, allowed: ["draft", "approved"], to: () => "missed" },
} as const;

const updates = () => calls.filter((c) => c.ops.includes("update"));

beforeEach(() => {
  resetFake();
  audits.length = 0;
  letter.withdrawRefusal = null;
  letter.startRefusal = null;
  letter.unclosed = null;
  letter.awaitsRefusal = null;
  letter.events.length = 0;
  draft.row = { ...DRAFT };
  draft.materialized = 0;
  draft.stampError = null;
});

describe("the allowed-from sets", () => {
  const cases = Object.entries(VERBS).flatMap(([verb, spec]) => STATUSES.map((status) => [verb, status, (spec.allowed as readonly string[]).includes(status)] as const));

  it.each(cases)("%s from %s: allowed %s", async (verb, status, allowed) => {
    const spec = VERBS[verb as keyof typeof VERBS];
    script("email_campaigns", { data: { status } }, { data: [{ id: "b-1" }] });
    // Approve counts the pending recipients before it writes.
    script("email_campaign_recipients", { count: 2 });
    const result = await spec.run("b-1", by);
    if (allowed) {
      expect(result).toEqual({ ok: true });
      expect(updates()).toHaveLength(1);
      expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: spec.to(status) }));
      expect(updates()[0].filters).toContainEqual(["eq", "id", "b-1"]);
      expect(audits).toHaveLength(1);
    } else {
      expect(result).toEqual({ ok: false, error: expect.stringContaining(status) });
      expect(updates()).toEqual([]);
      expect(letter.events).toEqual([]);
      expect(audits).toEqual([]);
    }
  });

  it("the module's table agrees with the one written here", () => {
    for (const [verb, spec] of Object.entries(VERBS)) {
      expect(BROADCAST_TRANSITIONS[verb as keyof typeof VERBS].from).toEqual(spec.allowed);
    }
    // The send routine's last move, which no button offers.
    expect(BROADCAST_TRANSITIONS.sent.from).toEqual(["sending"]);
  });

  it("tells a person to pause a sending broadcast before cancelling or deleting it", async () => {
    script("email_campaigns", { data: { status: "sending" } }, { data: { status: "sending" } });
    expect(await cancelBroadcastRow("b-1", by)).toEqual({ ok: false, error: "The broadcast is sending: pause it before cancelling it." });
    expect(await deleteBroadcastRow("b-1", by)).toEqual({ ok: false, error: "The broadcast is sending: pause it before deleting it." });
  });

  it("says a broadcast is not found, and a failed read is not taken for one", async () => {
    script("email_campaigns", { data: null }, { error: { message: "connection reset" } });
    expect(await cancelBroadcastRow("b-1", by)).toEqual({ ok: false, error: "Broadcast not found." });
    expect(await cancelBroadcastRow("b-1", by)).toEqual({ ok: false, error: "connection reset" });
    expect(updates()).toEqual([]);
  });
});

describe("Cancel and Delete withdraw the letter's send before the status write (BUG-2)", () => {
  it("cancel: read, withdraw, then write", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [{ id: "b-1" }] });
    expect(await cancelBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(timeline(letter.events)).toEqual(["email_campaigns:select", "withdraw", "email_campaigns:update"]);
  });

  it("cancel: a failed withdraw writes nothing, so the status is unchanged", async () => {
    letter.withdrawRefusal = "the approval could not be withdrawn";
    script("email_campaigns", { data: { status: "approved" } });
    expect(await cancelBroadcastRow("b-1", by)).toEqual({ ok: false, error: "the approval could not be withdrawn" });
    expect(updates()).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("delete: read, withdraw, then the archiving write", async () => {
    script("email_campaigns", { data: { status: "draft" } }, { data: [{ id: "b-1" }] });
    expect(await deleteBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(timeline(letter.events)).toEqual(["email_campaigns:select", "withdraw", "email_campaigns:update"]);
    expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: "cancelled", archived_by: by.email, archived_at: expect.any(String) }));
  });

  it("delete: a failed withdraw archives nothing", async () => {
    letter.withdrawRefusal = "the approval could not be withdrawn";
    script("email_campaigns", { data: { status: "approved" } });
    expect(await deleteBroadcastRow("b-1", by)).toEqual({ ok: false, error: "the approval could not be withdrawn" });
    expect(updates()).toEqual([]);
  });

  it("delete: a sent broadcast stays sent and has no send to withdraw", async () => {
    script("email_campaigns", { data: { status: "sent" } }, { data: [{ id: "b-1" }] });
    expect(await deleteBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(letter.events).toEqual([]);
    expect(updates()[0].filters).toContainEqual(["in", "status", ["sent"]]);
  });
});

describe("the conditional write", () => {
  it("cancel lands on a letter the withdraw thawed from approved back to draft, never on a sending one", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [{ id: "b-1" }] });
    await cancelBroadcastRow("b-1", by);
    expect(updates()[0].filters).toContainEqual(["in", "status", ["draft", "approved"]]);
  });

  it("delete of an unsent broadcast never archives a row that went out in the meantime", async () => {
    script("email_campaigns", { data: { status: "draft" } }, { data: [{ id: "b-1" }] });
    await deleteBroadcastRow("b-1", by);
    expect(updates()[0].filters).toContainEqual(["in", "status", ["draft", "approved", "cancelled", "missed"]]);
  });

  it.each([
    ["approve", approveBroadcastRow, "draft"],
    ["cancel", cancelBroadcastRow, "approved"],
    ["delete", deleteBroadcastRow, "draft"],
    ["start", startBroadcast, "approved"],
    ["pause", pauseBroadcastRow, "sending"],
    ["missed", markBroadcastMissedRow, "draft"],
  ] as const)("%s refuses when the write matched no row (a lost race), and records nothing after it", async (_verb, run, status) => {
    script("email_campaigns", { data: { status } }, { data: [] });
    script("email_campaign_recipients", { count: 2 });
    expect(await run("b-1", by)).toEqual({ ok: false, error: expect.stringMatching(/status was not changed/) });
    expect(letter.events.map((e) => e.label)).not.toContain("sentByHand");
    expect(audits).toEqual([]);
  });

  it("a failed write is reported with its error", async () => {
    script("email_campaigns", { data: { status: "draft" } }, { error: { message: "permission denied" } });
    expect(await markBroadcastMissedRow("b-1", by)).toEqual({ ok: false, error: "permission denied" });
  });
});

describe("Approve (A.55)", () => {
  it("approves a draft: checks, then the write with who approved it, then the audit", async () => {
    script("email_campaigns", { data: { status: "draft", series_id: null } }, { data: [{ id: "b-1" }] });
    script("email_campaign_recipients", { count: 3 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(updates()[0].payloads[0]).toEqual(
      expect.objectContaining({ status: "approved", approved_by: by.email, approved_at: expect.any(String) }),
    );
    expect(updates()[0].filters).toContainEqual(["in", "status", ["draft"]]);
    expect(audits).toEqual([expect.objectContaining({ actor: by.email, context: { approved: true, recipients: 3, sendWindow: null, scheduled: undefined } })]);
  });

  it("a series issue goes straight to sending, its send moment on the audit row", async () => {
    draft.row = { ...DRAFT, seriesId: "series-1", scheduledAt: "2026-10-20T08:00:00.000Z" };
    script("email_campaigns", { data: { status: "draft", series_id: "series-1" } }, { data: [{ id: "b-1" }] });
    script("email_campaign_recipients", { count: 3 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: "sending" }));
    expect(audits).toEqual([expect.objectContaining({ context: expect.objectContaining({ scheduled: "2026-10-20T08:00:00.000Z" }) })]);
  });

  it.each([
    ["an empty body", { bodyMd: "  " }, "Write the email body before approving."],
    ["the intro marker", { bodyMd: "Hi. [Write this week's intro]" }, "Write this week's intro before approving."],
    ["a series issue with no send time", { seriesId: "series-1", scheduledAt: null }, "This series issue has no send time. Set a schedule before approving."],
  ])("refuses %s and writes nothing", async (_case, patch, error) => {
    draft.row = { ...DRAFT, ...patch };
    script("email_campaigns", { data: { status: "draft" } });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: false, error });
    expect(updates()).toEqual([]);
    expect(draft.materialized).toBe(0);
    expect(audits).toEqual([]);
  });

  it("refuses an empty recipient list, after rebuilding a saved audience", async () => {
    draft.row = { ...DRAFT, audienceId: "aud-1" };
    script("email_campaigns", { data: { status: "draft" } });
    script("email_campaign_recipients", { count: 0 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: false, error: "Build the recipient list before approving." });
    expect(draft.materialized).toBe(1);
    expect(updates()).toEqual([]);
  });

  it("refuses a letter that is approved through its send approval (Y.17)", async () => {
    letter.awaitsRefusal = "This letter waits on its send approval.";
    script("email_campaigns", { data: { status: "draft" } });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: false, error: "This letter waits on its send approval." });
    expect(updates()).toEqual([]);
  });

  it("stamps the send window only after the write", async () => {
    draft.row = { ...DRAFT, segment: { sendWindow: { weekdays: [2], hour: 8 } } };
    script("email_campaigns", { data: { status: "draft" } }, { data: [{ id: "b-1" }] });
    script("email_campaign_recipients", { count: 2 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: true });
    expect(timeline(letter.events)).toEqual([
      "email_campaigns:select",
      "awaitsApproval",
      "email_campaign_recipients:select",
      "email_campaigns:update",
      "stamp",
    ]);
    expect(audits).toEqual([expect.objectContaining({ context: expect.objectContaining({ sendWindow: { timezone: 2, city: 0, country: 0, default: 0, stamped: 2 } }) })]);
  });

  it("a lost race stamps no window and audits nothing", async () => {
    draft.row = { ...DRAFT, segment: { sendWindow: { weekdays: [2], hour: 8 } } };
    script("email_campaigns", { data: { status: "draft" } }, { data: [] });
    script("email_campaign_recipients", { count: 2 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: false, error: expect.stringMatching(/status was not changed/) });
    expect(letter.events.map((e) => e.label)).not.toContain("stamp");
    expect(audits).toEqual([]);
  });

  it("a window that fails to stamp is reported while the approval stands and is audited", async () => {
    draft.row = { ...DRAFT, segment: { sendWindow: { weekdays: [2], hour: 8 } } };
    draft.stampError = "timezone lookup failed";
    script("email_campaigns", { data: { status: "draft" } }, { data: [{ id: "b-1" }] });
    script("email_campaign_recipients", { count: 2 });
    expect(await approveBroadcastRow("b-1", by)).toEqual({ ok: false, error: "Approved, but the delivery window could not be stamped: timezone lookup failed" });
    expect(updates()).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });
});

describe("a routine's move (A.55)", () => {
  const ROUTINE = "/api/cron/letter-agent/";

  it("start: approved -> sending, the audit names the routine, and no letter step runs", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [{ id: "b-1" }] });
    expect(await moveByRoutine("b-1", ROUTINE, "start")).toEqual({ ok: true, moved: true });
    expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: "sending" }));
    expect(updates()[0].filters).toContainEqual(["in", "status", ["approved"]]);
    expect(letter.events).toEqual([]);
    expect(audits).toEqual([expect.objectContaining({ actor: ROUTINE, context: { sending: true, released: true } })]);
  });

  it("a lost race answers moved: false, not an error, and audits nothing", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [] });
    expect(await moveByRoutine("b-1", ROUTINE, "start")).toEqual({ ok: true, moved: false });
    expect(audits).toEqual([]);
  });

  it("a row not where the verb moves it from, or not there at all, is moved: false, with no write", async () => {
    script("email_campaigns", { data: { status: "sending" } }, { data: { status: "sending" } }, { data: null });
    expect(await moveByRoutine("b-1", ROUTINE, "start")).toEqual({ ok: true, moved: false });
    expect(await moveByRoutine("b-1", ROUTINE, "cancel")).toEqual({ ok: true, moved: false });
    expect(await moveByRoutine("b-1", ROUTINE, "cancel")).toEqual({ ok: true, moved: false });
    expect(updates()).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("a failed read or write is still an error", async () => {
    script("email_campaigns", { error: { message: "connection reset" } }, { data: { status: "approved" } }, { error: { message: "permission denied" } });
    expect(await moveByRoutine("b-1", ROUTINE, "start")).toEqual({ ok: false, error: "connection reset" });
    expect(await moveByRoutine("b-1", ROUTINE, "start")).toEqual({ ok: false, error: "permission denied" });
  });

  it("cancel: the letter cancelling itself withdraws nothing", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [{ id: "b-1" }] });
    expect(await moveByRoutine("b-1", ROUTINE, "cancel")).toEqual({ ok: true, moved: true });
    expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: "cancelled" }));
    expect(updates()[0].filters).toContainEqual(["in", "status", ["draft", "approved"]]);
    expect(letter.events).toEqual([]);
    expect(audits).toEqual([expect.objectContaining({ actor: ROUTINE, context: { cancelled: true, from: "approved" } })]);
  });

  it("sent: sending -> sent, stamped with when", async () => {
    script("email_campaigns", { data: { status: "sending" } }, { data: [{ id: "b-1" }] });
    expect(await moveByRoutine("b-1", "/api/cron/email-campaign-send/", "sent")).toEqual({ ok: true, moved: true });
    expect(updates()[0].payloads[0]).toEqual(expect.objectContaining({ status: "sent", sent_at: expect.any(String) }));
  });
});

describe("Start sending and Pause keep their letter steps", () => {
  it("start asks the letter's approval first and writes nothing on a refusal", async () => {
    letter.startRefusal = "This letter waits on its send approval.";
    script("email_campaigns", { data: { status: "approved" } });
    expect(await startBroadcast("b-1", by)).toEqual({ ok: false, error: "This letter waits on its send approval." });
    expect(updates()).toEqual([]);
    expect(letter.events.map((e) => e.label)).toEqual(["manualStart"]);
  });

  it("start: approval, write, then the scheduled letter's run is closed", async () => {
    script("email_campaigns", { data: { status: "approved" } }, { data: [{ id: "b-1" }] });
    expect(await startBroadcast("b-1", by)).toEqual({ ok: true });
    expect(timeline(letter.events)).toEqual(["email_campaigns:select", "manualStart", "email_campaigns:update", "sentByHand"]);
  });

  it("pause: write, then the scheduled letter is marked past its send; an unclosed run is reported while the pause stands", async () => {
    letter.unclosed = "The send started, but the letter's run was not closed.";
    script("email_campaigns", { data: { status: "sending" } }, { data: [{ id: "b-1" }] });
    expect(await pauseBroadcastRow("b-1", by)).toEqual({ ok: false, error: letter.unclosed });
    expect(timeline(letter.events)).toEqual(["email_campaigns:select", "email_campaigns:update", "sentByHand"]);
    expect(audits).toHaveLength(1);
  });
});
