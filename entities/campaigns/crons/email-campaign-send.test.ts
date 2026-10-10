import { companyOs } from "@/kernel/data/supabase";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Characterisation test for the campaign send tick. It pins the two things this
// handler is responsible for beyond sending: the per-row status writes, and the
// summary the run reports. The fake Supabase client is the kernel's house fake
// (kernel/data/testing/fake-company-os.ts): `companyOs.from(table)` returns a
// chainable builder resolving to the next scripted response for that table,
// recording its operations and the rows it writes, and throwing on a query no
// test scripted.

type Response = { data?: unknown; error?: { message: string } | null };
let rpcResponse: Response = { data: [] };

vi.mock("@/kernel/data/supabase", () => ({
  companyOs: {
    from: (table: string) => builderFor(table),
    rpc: () => Promise.resolve({ data: rpcResponse.data ?? null, error: rpcResponse.error ?? null }),
  },
}));

// The routine-run wrapper only records the run, so it is called straight
// through; the real outcome rule (Y.13) still decides the response.
vi.mock("@/kernel/audit/routine-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/kernel/audit/routine-runs")>()),
  withRoutineRun: (_id: string, req: Request, handler: (req: Request) => Promise<Response>) => handler(req),
}));

const sendMarketingEmail = vi.fn();
// These moved out of site and into this entity with RS-08: the blog reader and
// the marketing-email renderer are about marketing_content and broadcasts,
// which campaigns owns, and site importing them made the two mutually dependent.
vi.mock("../lib/marketing-email", () => ({
  sendMarketingEmail: (...args: unknown[]) => sendMarketingEmail(...args),
}));
vi.mock("../lib/marketing-email-blocks", () => ({
  parseBroadcastBlocks: () => ({ posts: [], cta: null, layout: "cards" }),
}));
vi.mock("../lib/marketing-email-utm", () => ({ utmCampaignFor: () => "2026-09-08-hello" }));

vi.mock("@/entities/campaigns/lib/broadcast-blocks", () => ({
  resolveBroadcastBlocks: async () => ({ posts: [], cta: null, layout: "cards" }),
}));

// The pre-send decision is mocked for the reason checkSendGate used to be: its
// rules are unit-tested in lib/send-cap.test.ts and lib/send-decision.test.ts,
// and letting the real one run here would tie this test to how many reads the
// cap makes and against which tables. What this file proves is the wiring —
// that the tick asks, and honours what it is told.
const decideSend = vi.fn();
vi.mock("@/entities/campaigns/lib/send-decision", () => ({
  decideSend: (...args: unknown[]) => decideSend(...args),
}));

import { GET } from "./email-campaign-send";

const CAMPAIGN = {
  id: "camp-1",
  subject: "Hello",
  preheader: null,
  body_md: "# hi",
  from_email: null,
  reply_to: null,
  batch_size: 10,
  scheduled_at: null,
};

const recipientUpdates = () =>
  calls.filter((c) => c.table === "email_campaign_recipients" && c.ops.includes("update"));

function run() {
  return GET(new Request("https://example.com/api/cron/email-campaign-send/"));
}

beforeEach(() => {
  resetFake();
  rpcResponse = { data: [] };
  sendMarketingEmail.mockReset();
  decideSend.mockReset();
  // Default: nothing stops the send. Tests that care set their own.
  decideSend.mockResolvedValue({ action: "send" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("email campaign send tick", () => {
  it("marks a sent recipient and reports no write failures", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { data: null });
    script("email_events", { data: null });

    const body = await (await run()).json();

    expect(body).toMatchObject({ campaign: "camp-1", batch: 1, sent: 1, writeFailures: 0 });
    expect(recipientUpdates()).toHaveLength(1);
    expect((recipientUpdates()[0].payloads[0] as Record<string, unknown>)).toMatchObject({
      status: "sent",
      resend_email_id: "re_1",
    });
  });

  // Y.17 review: each recipient's email goes to Resend under its own key, so a
  // batch retried after a crash mails nobody twice.
  it("sends each recipient under its own Resend idempotency key", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { data: null });
    script("email_events", { data: null });
    await run();
    expect(sendMarketingEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "campaign:camp-1:recipient:row-1" }));
  });

  it("counts a failed 'mark sent' write into the summary without changing the send outcome", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { error: { message: "update timed out" } });
    script("email_events", { data: null });

    const res = await run();
    const body = await res.json();

    expect(body).toMatchObject({ campaign: "camp-1", sent: 1, failed: 0, writeFailures: 1 });
    // The mail went out and only its record failed: the run says so by name (Y.20).
    expect(res.status).toBe(500);
    expect(body.error).toContain("recipient row-1 at marking row-1 sent: update timed out");
  });

  it("counts a recipient Resend refused, records it on the row, and keeps the run ok with no address in its error", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    sendMarketingEmail.mockResolvedValue({ ok: false, error: "mailbox does not exist" });
    script("email_campaign_recipients", { data: null });
    script("email_events", { data: null });

    const res = await run();
    const body = await res.json();

    // One bad address must not turn every broadcast it is in red, nor put the
    // address into the run log (review of #1973).
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", failed: 1, sent: 0 });
    expect(JSON.stringify(body.failures ?? [])).not.toContain("a@example.com");
  });

  it("reports a tick with nothing to send as ok, and a day with no campaign as skipped", async () => {
    script("email_campaigns", { data: [] });
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "skipped", reason: "No campaign is due.", sending: 0 });
  });

  // A.15. Before this, the broadcast tick never asked about the daily cap, so a
  // personal message sent at 08:20 did not stop this batch at 08:30 and a
  // person could receive two marketing emails in one company day.
  it("asks the pre-send decision for this recipient, as a broadcast", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    sendMarketingEmail.mockResolvedValue({ ok: true, resendEmailId: "re_1" });
    script("email_campaign_recipients", { data: null });
    script("email_events", { data: null });

    await run();

    expect(decideSend).toHaveBeenCalledTimes(1);
    expect(decideSend.mock.calls[0][0]).toBe("broadcast");
    expect(decideSend.mock.calls[0][1]).toEqual({ personId: "p1", email: "a@example.com" });
  });

  it("defers a recipient the cap holds, and does not send", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    decideSend.mockResolvedValue({ action: "defer", reason: "emailed today", retryAfter: new Date("2026-09-20T00:00:00+07:00") });
    script("email_campaign_recipients", { data: null });

    const body = await (await run()).json();

    expect(sendMarketingEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ campaign: "camp-1", deferred: 1, sent: 0 });
    // Back to pending, not skipped: they get this campaign tomorrow, not never.
    // And the row leaves TODAY. Without send_after, claim_campaign_batch hands
    // this recipient straight back on the next tick and the cap is re-asked
    // every fifteen minutes until the company day rolls — ninety-six reads that
    // can only say no. This assertion is the one that was missing.
    expect((recipientUpdates()[0].payloads[0] as Record<string, unknown>)).toMatchObject({
      status: "pending",
      claimed_at: null,
      send_after: "2026-09-19T17:00:00.000Z",
    });
  });

  it("does not delay a transiently deferred recipient, which should retry at once", async () => {
    // The other half of the pair: a gate hiccup is not a cap, so nothing goes on
    // send_after and the next tick picks the row straight back up.
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    decideSend.mockResolvedValue({ action: "defer", reason: "gate check failed: hiccup", retryAfter: null });
    script("email_campaign_recipients", { data: null });

    await run();

    const patch = (recipientUpdates()[0].payloads[0] as Record<string, unknown>);
    expect(patch).toMatchObject({ status: "pending", claimed_at: null });
    expect(patch.send_after).toBeUndefined();
  });

  it("defers rather than sends when the cap evidence could not be read", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    decideSend.mockResolvedValue({ action: "defer", reason: "cap evidence unavailable: db hiccup", retryAfter: null });
    script("email_campaign_recipients", { data: null });

    const body = await (await run()).json();

    expect(sendMarketingEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ deferred: 1, sent: 0 });
  });

  it("defers a row whose gate check errored, and counts a failed deferral", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [{ id: "row-1", person_id: "p1", email: "a@example.com" }] };
    decideSend.mockResolvedValue({ action: "defer", reason: "gate check failed: db hiccup", retryAfter: null });
    script("email_campaign_recipients", { error: { message: "update timed out" } });

    const body = await (await run()).json();

    expect(sendMarketingEmail).not.toHaveBeenCalled();
    expect(body).toMatchObject({ deferred: 1, sent: 0, writeFailures: 1 });
    expect((recipientUpdates()[0].payloads[0] as Record<string, unknown>)).toMatchObject({
      status: "pending",
      claimed_at: null,
    });
  });

  it("refuses to complete a campaign when the in-flight count fails", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [] };
    script("email_campaign_recipients", { error: { message: "count failed" } });

    const res = await run();

    expect(res.status).toBe(500);
    // The 'mark sent' update must not have been attempted.
    expect(calls.filter((c) => c.table === "email_campaigns" && c.ops.includes("update"))).toHaveLength(0);
  });

  it("completes a campaign once nothing is in flight", async () => {
    script("email_campaigns", { data: [CAMPAIGN] });
    rpcResponse = { data: [] };
    script("email_campaign_recipients", { count: 0 });
    script("email_campaigns", { data: null });

    const body = await (await run()).json();

    expect(body).toMatchObject({ campaign: "camp-1", completed: true, writeFailures: 0 });
  });
});
