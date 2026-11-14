import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Who hears what about an advance. The rules that matter: the approver who said yes is
// not told to record the transfer, a link goes only to someone whose access reaches it,
// a retry never sends twice, no notice carries a bank detail, and a failed email never
// reads as a failed move.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const sent = vi.hoisted(() => [] as { to: string; subject: string; html: string; idempotencyKey?: string }[]);
const email = vi.hoisted(() => ({ fail: false, declined: false }));
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: async (m: { to: string; subject: string; html: string; idempotencyKey?: string }) => {
    if (email.fail) throw new Error("mail down");
    sent.push(m);
    return !email.declined;
  },
}));
const access = vi.hoisted(() => ({ mayOpen: true, holders: [] as string[] }));
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: async () => () => access.mayOpen,
  mayOpen: () => access.mayOpen,
}));
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async () => access.holders }));
vi.mock("@/kernel/identity/access-of-person", () => ({ accessOf: async () => ({ may: () => true }) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://app.test" }));
vi.mock("@/kernel/config/contacts", () => ({ EMAIL_SIGN_OFF: "", accountingEmail: () => "accounting@test" }));
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: async () => {} }));

import { tellOwnerOfReinstate, tellPayersOfReinstate, tellPayersOfMoneyOwed, tellApproversOfRequest, tellOfOverdue, tellOwnerOfClose, tellOwnerOfDeadline, tellOwnerOfDecision, tellOwnerOfPayout, tellOwnerOfReturnConfirmed, tellPayersOfCancel, tellPayersOfReportedReturn, tellPayersToTransfer } from "./advance-notices";

const about = { advanceId: "advance-1", refNo: 7, ownerPersonId: "owner", purpose: "Venue <deposit>", amountVnd: 8_000_000, eventId: "event-1" };
const person = (id: string) => ({ id, email: `${id}@test`, full_name: id, display_name: id, preferred_name: null, first_name: id });

function scriptHolders(...ids: string[]) {
  access.holders = ids;
  script("people", { data: { full_name: "Owner Person" } }, { data: ids.map(person) });
}

beforeEach(() => {
  resetFake();
  sent.length = 0;
  email.declined = false;
  email.fail = false;
  access.mayOpen = true;
  access.holders = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("to the owner", () => {
  it("says the advance is back on and why, escaped", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfReinstate({ ...about, reason: "Sent <before> the cancel" });
    expect(sent[0].to).toBe("owner@test");
    expect(sent[0].subject).toContain("back on");
    expect(sent[0].html).toContain("Sent &lt;before&gt; the cancel");
  });

  it("sends the reason when it is sent back, escaped", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfDecision({ ...about, became: "sent_back", reason: "Quote <b>smaller</b>" });
    expect(sent[0].to).toBe("owner@test");
    expect(sent[0].subject).toContain("sent back");
    expect(sent[0].html).toContain("Quote &lt;b&gt;smaller&lt;/b&gt;");
    expect(sent[0].html).toContain("/team/claims/advances/advance-1");
    expect(sent[0].html).toContain("Venue &lt;deposit&gt;");
  });

  it("says approved, and rejected with the reason", async () => {
    script("people", { data: person("owner") }, { data: person("owner") });
    await tellOwnerOfDecision({ ...about, became: "approved", reason: null });
    await tellOwnerOfDecision({ ...about, became: "rejected", reason: "No budget" });
    expect(sent.map((m) => m.subject.split(":")[0])).toEqual(["Advance approved", "Advance rejected"]);
    expect(sent[1].html).toContain("No budget");
  });

  it("gives the deadline with the payout", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfPayout({ ...about, settleBy: "2026-11-30" });
    expect(sent[0].html).toContain("2026");
    expect(sent[0].html).toContain("settle by");
  });

  it("says what is still owed after a part, and settled after the last", async () => {
    script("people", { data: person("owner") }, { data: person("owner") });
    await tellOwnerOfReturnConfirmed({ ...about, outstandingAfterVnd: 240_000 });
    await tellOwnerOfReturnConfirmed({ ...about, outstandingAfterVnd: 0 });
    expect(sent[0].subject).toContain("Return recorded");
    expect(sent[0].html).toContain("240");
    expect(sent[1].subject).toContain("Advance settled");
  });

  it("sends nothing to someone whose access does not reach the page", async () => {
    script("people", { data: person("owner") });
    access.mayOpen = false;
    await tellOwnerOfPayout({ ...about, settleBy: "2026-11-30" });
    expect(sent).toEqual([]);
  });

  it("is keyed by the history row, so a retry never sends twice", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfPayout({ ...about, settleBy: "2026-11-30" });
    expect(sent[0].idempotencyKey).toBe("advance:advance-1:event-1:owner");
  });

  it("never throws when the email fails: the money has already moved", async () => {
    script("people", { data: person("owner") });
    email.fail = true;
    await expect(tellOwnerOfPayout({ ...about, settleBy: "2026-11-30" })).resolves.toBeUndefined();
  });

  it("never throws when the read fails", async () => {
    script("people", { data: null, error: { message: "down" } });
    await expect(tellOwnerOfPayout({ ...about, settleBy: "2026-11-30" })).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });
});

describe("the deadline", () => {
  it("reminds the owner, naming the date", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfDeadline({ ...about, settleBy: "2026-11-30" });
    expect(sent.map((m) => m.to)).toEqual(["owner@test"]);
    expect(sent[0].html).toContain("2026");
  });

  it("asks for the money, not receipts, when it is owed back", async () => {
    script("people", { data: person("owner") });
    await tellOwnerOfDeadline({ ...about, settleBy: "2026-11-30", owedVnd: 640_000 });
    expect(sent[0].subject).toContain("Return your advance");
    expect(sent[0].html).toContain("₫640,000");
    expect(sent[0].html).not.toContain("red invoices");
  });

  it("tells the owner and Finance once it has passed, keeping the owner off Finance's list", async () => {
    script("people", { data: person("owner") }, { data: { full_name: "Owner Person" } }, { data: [person("payer")] });
    access.holders = ["owner", "payer"];
    await tellOfOverdue({ ...about, settleBy: "2026-11-30", eventId: "overdue" });
    expect(sent.map((m) => m.to)).toEqual(["owner@test", "payer@test"]);
    expect(sent[1].subject).toContain("Overdue advance");
  });
});

describe("how a settlement ended", () => {
  it.each([
    [720_000, "owes you", "₫720,000"],
    [0, "nothing moves", null],
    [-640_000, "return", "ADV-0007 HOAN UNG"],
  ])("with a balance of %s, says so", async (balanceVnd, says, more) => {
    script("people", { data: person("owner") });
    await tellOwnerOfClose({ ...about, balanceVnd });
    expect(sent[0].html).toContain(says);
    if (more) expect(sent[0].html).toContain(more);
  });
});

describe("to the holders", () => {
  it("tells the approvers of a request, leaving out its owner", async () => {
    scriptHolders("owner", "approver");
    await tellApproversOfRequest(about);
    expect(sent.map((m) => m.to)).toEqual(["approver@test"]);
    expect(sent[0].subject).toContain("Advance to approve");
    // The decision page, whose permission they hold, rather than Finance's.
    expect(sent[0].html).toContain("/team/finance/advances/advance-1/decision");
  });

  it("tells the payers to transfer, leaving out whoever approved it", async () => {
    scriptHolders("approver", "payer");
    await tellPayersToTransfer({ ...about, approvedBy: "approver" });
    expect(sent.map((m) => m.to)).toEqual(["payer@test"]);
    expect(sent[0].html).toContain("/team/finance/advances/advance-1");
  });

  it("gives each recipient their own key, because a shared one would send to the first only", async () => {
    scriptHolders("payer-two", "payer");
    await tellPayersToTransfer({ ...about, approvedBy: null });
    expect(sent.map((m) => m.idempotencyKey)).toEqual(["advance:advance-1:event-1:payer-two", "advance:advance-1:event-1:payer"]);
  });

  it("tells the payers of a cancel, with the reason, so nobody sends it", async () => {
    scriptHolders("payer");
    await tellPayersOfCancel({ ...about, reason: "The trip moved" });
    expect(sent[0].subject).toContain("Don't transfer");
    expect(sent[0].html).toContain("The trip moved");
  });

  it("tells the other payers not to send it again, leaving out the owner and whoever put it back", async () => {
    access.holders = ["owner", "putter", "payer"];
    script("people", { data: { full_name: "Owner Person" } }, { data: [person("payer")] });
    await tellPayersOfReinstate({ ...about, reason: "It went at 09:40.", putBackBy: "putter" });
    expect(sent.map((m) => m.to)).toEqual(["payer@test"]);
    expect(sent[0].subject).toContain("Don't send again");
  });

  it("tells the payers what is owed back, with the reference to look for", async () => {
    scriptHolders("payer");
    await tellPayersOfMoneyOwed({ ...about, owedVnd: 640_000 });
    expect(sent[0].subject).toContain("₫640,000");
    expect(sent[0].html).toContain("ADV-0007 HOAN UNG");
  });

  it("tells the payers of a reported return", async () => {
    scriptHolders("payer");
    await tellPayersOfReportedReturn({ ...about, eventId: null });
    expect(sent[0].subject).toContain("Money coming back");
    expect(sent[0].idempotencyKey).toBeUndefined();
  });

  it("carries no bank detail in any notice", async () => {
    scriptHolders("payer");
    await tellPayersToTransfer({ ...about, approvedBy: null });
    expect(sent[0].html).not.toMatch(/account number|\b\d{8,}\b/i);
  });

  it("sends nothing when nobody holds the permission, and logs it", async () => {
    script("people", { data: { full_name: "Owner Person" } });
    await tellPayersToTransfer({ ...about, approvedBy: null });
    expect(sent).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("never throws when the read fails", async () => {
    script("people", { data: null, error: { message: "down" } });
    await expect(tellPayersToTransfer({ ...about, approvedBy: null })).resolves.toBeUndefined();
  });
});

// The reminders report what these answer, because their stamp is already spent by then.
describe("whether a reminder was delivered", () => {
  const owner = { data: { email: "owner@test", full_name: "Owner Person", display_name: "Owner", preferred_name: null, first_name: "Owner" } };

  it("is yes when the email was accepted", async () => {
    script("people", owner);
    expect(await tellOwnerOfDeadline({ ...about, settleBy: "2026-11-30" })).toBe(true);
  });

  it.each([
    ["the sender declined it", () => void (email.declined = true)],
    ["the sender threw", () => void (email.fail = true)],
  ])("is no when %s", async (_why, arrange) => {
    arrange();
    script("people", owner);
    expect(await tellOwnerOfDeadline({ ...about, settleBy: "2026-11-30" })).toBe(false);
  });

  it("is no when the owner has no address", async () => {
    script("people", { data: { ...owner.data, email: null } });
    expect(await tellOwnerOfDeadline({ ...about, settleBy: "2026-11-30" })).toBe(false);
  });

  it("is no for an overdue notice when nobody at Finance can be reached", async () => {
    script("people", owner);
    scriptHolders();
    expect(await tellOfOverdue({ ...about, settleBy: "2026-11-30" })).toBe(false);
  });

  it("is yes for an overdue notice when the owner and Finance were both told", async () => {
    script("people", owner);
    scriptHolders("finance");
    expect(await tellOfOverdue({ ...about, settleBy: "2026-11-30" })).toBe(true);
  });
});
