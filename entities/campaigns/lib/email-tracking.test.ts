import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The email-tracking questions and writes campaigns' door answers for
// company-os's Resend webhook and broadcast recap (A.70). Each row is the query
// or write company-os built by hand before A.70 through
// selectEmailCampaignRecipients, selectEmailMessages, selectEmailCampaigns,
// insertEmailEvents or updateEmailCampaigns, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { broadcastsAwaitingRecap, campaignOfResendEmail, markRecapPosted, messageOfResendEmail, recordEmailEvent } from "./email-tracking";

const NOW = "2026-10-26T03:00:00.000Z";
beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

const EVENT = {
  resend_email_id: "re_1",
  svix_id: "msg_1",
  event_type: "email.opened",
  recipient: "a@example.test",
  occurred_at: "2026-10-26T03:00:00.000Z",
};

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  [
    "campaignOfResendEmail",
    () => campaignOfResendEmail("re_1"),
    "email_campaign_recipients",
    [["select", "campaign_id"], ["eq", "resend_email_id", "re_1"], ["maybeSingle"]],
  ],
  ["messageOfResendEmail", () => messageOfResendEmail("re_1"), "email_messages", [["select", "id"], ["eq", "resend_email_id", "re_1"], ["maybeSingle"]]],
  ["recordEmailEvent", () => recordEmailEvent(EVENT), "email_events", [["insert", EVENT]]],
  [
    "broadcastsAwaitingRecap",
    () => broadcastsAwaitingRecap("2026-10-25T03:00:00.000Z", 5),
    "email_campaigns",
    [
      ["select", "id, name, subject, approved_at"],
      ["eq", "status", "sent"],
      ["is", "summary_posted_at", null],
      ["lte", "sent_at", "2026-10-25T03:00:00.000Z"],
      ["order", "sent_at", { ascending: true }],
      ["limit", 5],
    ],
  ],
  ["markRecapPosted", () => markRecapPosted("c1"), "email_campaigns", [["update", { summary_posted_at: NOW }], ["eq", "id", "c1"]]],
];

describe("email-tracking questions and writes", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
