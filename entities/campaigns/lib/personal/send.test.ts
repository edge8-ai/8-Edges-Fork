import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script, type Scripted } from "@/kernel/data/testing/fake-company-os";

// The personal send loop had no test at all (A.18). The pure modules under it —
// send-cap, send-window, send-decision — are covered; the orchestration that
// claims a row, acts on the decision and writes the outcome back was not, and
// that is the layer where a marketing email goes to the wrong person twice or
// not at all.
//
// The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts). Every query here is on
// email_messages, scripted in call order, which is deterministic: release
// stale, read the due rows, then per row a claim and a patch.

const decideSend = vi.fn();
const sendMarketingEmail = vi.fn();

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => builderFor(t) } }));
vi.mock("../send-decision", () => ({ decideSend: (...a: unknown[]) => decideSend(...a) }));
vi.mock("../marketing-email", () => ({ sendMarketingEmail: (...a: unknown[]) => sendMarketingEmail(...a) }));
vi.mock("./data", () => ({ getAgent: async () => ({ fromEmail: "agent@example.com", replyTo: null }) }));

const { sendDueMessages } = await import("./send");

const NOW = new Date("2026-09-19T10:20:00+07:00");
const due = (over: Record<string, unknown> = {}) => ({
  id: "m-1",
  agent_id: "ag-1",
  person_id: "p-1",
  subject: "Hello",
  body_md: "Body",
  people: { email: "them@example.com", first_name: "Sam", preferred_name: null },
  ...over,
});

/** releaseStale, then the due read, then whatever the row's path needs. */
function scriptRun(rows: unknown[], ...rest: Scripted[]) {
  script("email_messages", { error: null }, { data: rows }, ...rest);
}

/** The row the last update wrote. */
const lastWrite = () => calls.filter((c) => c.ops.includes("update")).at(-1)?.payloads[0] as Record<string, unknown> | undefined;

beforeEach(() => {
  resetFake();
  decideSend.mockReset();
  sendMarketingEmail.mockReset();
});

describe("the personal send loop", () => {
  it("sends a claimed message and records the Resend id against it", async () => {
    decideSend.mockResolvedValue({ action: "send" });
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1", interactionId: "int_1" });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: null });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0, writeFailures: 0 });
    expect(lastWrite()).toMatchObject({ status: "sent", resend_email_id: "re_1", interaction_id: "int_1" });
  });

  it("pushes a capped message to tomorrow rather than retrying it on the next tick", async () => {
    // The one behaviour that makes the daily cap cheap: the row leaves today.
    // Without it the tick reclaims and re-gates the same person every run.
    decideSend.mockResolvedValue({ action: "defer", reason: "emailed today", retryAfter: new Date("2026-09-20T00:00:00+07:00") });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: null });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ deferred: 1, sent: 0 });
    const patch = lastWrite() as { status: string; send_after?: string };
    expect(patch.status).toBe("approved");
    expect(new Date(patch.send_after as string).getTime()).toBe(NOW.getTime() + 86_400_000);
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });

  it("returns a transiently deferred message for the next tick, with no delay", async () => {
    decideSend.mockResolvedValue({ action: "defer", reason: "gate check failed", retryAfter: null });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: null });

    await sendDueMessages({ now: NOW });

    const patch = lastWrite() as Record<string, unknown>;
    expect(patch.status).toBe("approved");
    expect(patch.claimed_at).toBeNull();
    expect(patch.send_after).toBeUndefined();
  });

  it("records the suppression reason on a skipped message", async () => {
    decideSend.mockResolvedValue({ action: "skip", reason: "unsubscribed" });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: null });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ skipped: 1, sent: 0 });
    expect(lastWrite()).toMatchObject({ status: "skipped", skip_reason: "unsubscribed" });
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });

  it("never asks the decision about a row it lost the claim on", async () => {
    // Two ticks raced; the other one took this row. Claiming returns no row.
    scriptRun([due()], { data: [] });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ claimed: 0, sent: 0, deferred: 0, skipped: 0 });
    expect(decideSend).not.toHaveBeenCalled();
  });

  it("skips a message whose person has gone, without asking the decision", async () => {
    scriptRun([due({ people: null })], { data: [{ id: "m-1" }] }, { error: null });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ claimed: 1, skipped: 1 });
    expect(lastWrite()).toMatchObject({ status: "skipped", skip_reason: "person no longer exists" });
    expect(decideSend).not.toHaveBeenCalled();
  });

  it("counts a failed bookkeeping write without pretending the mail did not go", async () => {
    decideSend.mockResolvedValue({ action: "send" });
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_2", interactionId: null });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: { message: "write blew up" } });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ sent: 1, writeFailures: 1 });
  });

  it("leaves a failed send cancelled rather than retrying a bad address", async () => {
    decideSend.mockResolvedValue({ action: "send" });
    sendMarketingEmail.mockResolvedValue({ ok: false, error: "bounced" });
    scriptRun([due()], { data: [{ id: "m-1" }] }, { error: null });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary).toMatchObject({ failed: 1, sent: 0 });
    expect(lastWrite()).toMatchObject({ status: "cancelled", error: "bounced" });
  });

  it("reports the read error and sends nothing when the due query fails", async () => {
    script("email_messages", { error: null }, { error: { message: "queue unreadable" } });

    const summary = await sendDueMessages({ now: NOW });

    expect(summary.error).toBe("queue unreadable");
    expect(summary.sent).toBe(0);
    expect(sendMarketingEmail).not.toHaveBeenCalled();
  });
});
