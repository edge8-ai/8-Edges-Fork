import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The owner's email when a claim is sent back or rejected (design §1.8): what
// they receive, that a link goes only to someone who may open it, and that a
// retried action sends at most once. The transport is the kernel's; here it
// records what it was asked to send.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const sent: Record<string, unknown>[] = [];
let transportFails = false;
vi.mock("@/kernel/messaging/email", () => ({
  sendTransactionalEmail: async (opts: Record<string, unknown>) => {
    if (transportFails) throw new Error("resend down");
    sent.push(opts);
    return true;
  },
}));
const mayOpen = new Set<string>();
vi.mock("@/kernel/identity/may-open", () => ({
  recipientMayOpen: async (personId: string) => (href: string) => mayOpen.has(`${personId} ${href}`),
  mayOpen: (access: { personId: string } | null, href: string) => !!access && mayOpen.has(`${access.personId} ${href}`),
}));
// The approvers are whoever holds reimbursements.approve through a grant; the
// employer's exemption is read from each one's access.
let holders: string[] = [];
const decidesOwn = new Set<string>();
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async (p: string) => (p === "reimbursements.approve" ? holders : []) }));
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: async (personId: string) => ({ personId, may: (p: string) => p === "reimbursements.decide-own" && decidesOwn.has(personId) }),
}));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://example.test" }));
// The Operations chat: what it was asked to post.
const posted: unknown[] = [];
vi.mock("@/kernel/messaging/lark", () => ({ notifyOps: async (m: unknown) => void posted.push(m) }));

import { tellAccountingOfRunPaid, tellApproversOfCheck, tellOfRunBuilt, tellOfSubmission, tellOwnerOfDecision, tellOwnerOfPayment, tellOwnerOfReturn } from "./notices";

const PERSON_A = "person-a";
const decision = {
  claimId: "claim-1",
  ownerPersonId: PERSON_A,
  title: "Hanoi <workshop>",
  became: "sent_back" as const,
  step: "check" as const,
  reason: "The taxi receipt is unreadable & blurry.",
  eventId: "event-7",
};

beforeEach(() => {
  resetFake();
  sent.length = 0;
  mayOpen.clear();
  transportFails = false;
  holders = [];
  decidesOwn.clear();
  posted.length = 0;
  vi.unstubAllEnvs();
});

describe("tellOfSubmission (RB.8)", () => {
  const submitted = { claimId: "claim-1", ownerPersonId: PERSON_A, title: "Australia trip, taxis", receipts: 20, resubmitted: false, eventId: "event-1" };

  it("posts one line to the Operations chat and emails accounting@ a link, with no amount and no bank detail", async () => {
    vi.stubEnv("ACCOUNTING_EMAIL", "books@example.test");
    script("people", { data: { full_name: "Blair Moss" } });
    await tellOfSubmission(submitted);
    expect(posted).toEqual(["Blair Moss submitted a claim: Australia trip, taxis, 20 receipts. https://example.test/admin/finance/reimbursements/claim-1"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "books@example.test", subject: "Claim submitted: Australia trip, taxis", idempotencyKey: "claim:claim-1:event-1:accounting" });
    const html = String(sent[0].html);
    expect(html).toContain("https://example.test/team/finance/claims/claim-1");
    expect(html).not.toMatch(/₫|VND|account/i);
  });

  it("says resubmitted for a claim sent back and submitted again", async () => {
    script("people", { data: { full_name: "Blair Moss" } });
    await tellOfSubmission({ ...submitted, resubmitted: true });
    expect(String(posted[0])).toMatch(/^Blair Moss resubmitted a claim/);
  });
});

describe("tellOwnerOfPayment and tellOwnerOfReturn (RB.7)", () => {
  const claims = [
    { id: "claim-1", title: "Australia <taxis>" },
    { id: "claim-2", title: "Hanoi workshop" },
  ];

  it("emails the person what was sent with links to their claims, and never attaches the receipt", async () => {
    script("people", { data: { email: "a@example.test", full_name: "Blair Moss", first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`).add(`${PERSON_A} /team/claims/claim-2`);
    await tellOwnerOfPayment({ paymentId: "pay-1", personId: PERSON_A, paidVnd: 1_490_000, claims });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a@example.test", idempotencyKey: "payment:pay-1:paid" });
    expect(sent[0]).not.toHaveProperty("attachments");
    const html = String(sent[0].html);
    expect(html).toContain("https://example.test/team/claims/claim-1");
    expect(html).toContain("Australia &lt;taxis&gt;");
    expect(html).toContain("1,490,000");
  });

  it("asks the person to check their bank details when a transfer was returned, with the reason", async () => {
    script("people", { data: { email: "a@example.test", full_name: "Blair Moss", first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    await tellOwnerOfReturn({ paymentId: "pay-1", personId: PERSON_A, reason: "Account number rejected", claims: [claims[0]] });
    expect(sent[0]).toMatchObject({ subject: "Your reimbursement could not be paid", idempotencyKey: "payment:pay-1:returned" });
    expect(String(sent[0].html)).toMatch(/Account number rejected[\s\S]*check the bank details/);
  });

  it("sends nothing to a person whose access opens none of the claims", async () => {
    script("people", { data: { email: "a@example.test", full_name: "Blair Moss" } });
    await tellOwnerOfPayment({ paymentId: "pay-1", personId: PERSON_A, paidVnd: 1, claims });
    expect(sent).toHaveLength(0);
  });
});

describe("tellAccountingOfRunPaid (RB.7)", () => {
  it("emails accounting@ once the whole run is paid, with the people and the total sent", async () => {
    vi.stubEnv("ACCOUNTING_EMAIL", "books@example.test");
    await tellAccountingOfRunPaid({ runId: "run-1", runDate: "2026-10-15", people: 7, totalVnd: 38_200_000 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "books@example.test", idempotencyKey: "payment-run:run-1:paid" });
    expect(String(sent[0].subject)).toMatch(/is paid: 7 people/);
  });
});

describe("tellOfRunBuilt", () => {
  const built = { runId: "run-1", runDate: "2026-10-15", people: 7, claims: 9, totalVnd: 38_200_000 };

  it("emails accounting@ a link with the counts and total, and posts one line to the Operations chat", async () => {
    vi.stubEnv("ACCOUNTING_EMAIL", "books@example.test");
    await tellOfRunBuilt(built);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "books@example.test", idempotencyKey: "payment-run:run-1:built" });
    const html = String(sent[0].html);
    expect(html).toContain("https://example.test/team/finance/payment-runs/run-1");
    expect(html).toContain("7 people");
    expect(posted).toHaveLength(1);
    expect(String(posted[0])).toMatch(/^Payment run .*: 7 people, .*38,200,000/);
  });

  it("skips accounting@ while ACCOUNTING_EMAIL is unset, and still tells the Operations chat", async () => {
    vi.stubEnv("ACCOUNTING_EMAIL", "");
    await tellOfRunBuilt(built);
    expect(sent).toHaveLength(0);
    expect(posted).toHaveLength(1);
  });
});

describe("tellApproversOfCheck", () => {
  const checked = { claimId: "claim-1", ownerPersonId: PERSON_A, title: "Hanoi <workshop>", checkedBy: "person-finance", eventId: "event-3" };
  const people = (...rows: Record<string, unknown>[]) => script("people", { data: rows });
  const CLAIM_PAGE = "/admin/finance/reimbursements/claim-1";
  const TO_APPROVE = "/admin/finance/reimbursements/to-approve";

  it("emails each approver a link to the claim inside Admin, keyed per recipient and history row", async () => {
    holders = ["person-employer", "person-b"];
    mayOpen.add(`person-employer ${CLAIM_PAGE}`).add(`person-b ${CLAIM_PAGE}`);
    people(
      { id: "person-employer", email: "employer@example.test", first_name: "Drew", display_name: "Drew" },
      { id: "person-b", email: "b@example.test", first_name: "Bea", display_name: "Bea" },
      { id: PERSON_A, email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" },
    );
    await tellApproversOfCheck(checked);
    expect(sent.map((s) => [s.to, s.idempotencyKey])).toEqual([
      ["employer@example.test", "claim:claim-1:event-3:person-employer"],
      ["b@example.test", "claim:claim-1:event-3:person-b"],
    ]);
    expect(sent[0].subject).toBe("To approve: Hanoi <workshop>");
    const html = String(sent[0].html);
    expect(html).toContain("Hi Drew,");
    expect(html).toContain("Avery Stone");
    expect(html).toContain("Hanoi &lt;workshop&gt;");
    expect(html).toContain(`https://example.test${CLAIM_PAGE}`);
    // No email decides anything: the decision is made on the page.
    expect(html).not.toMatch(/>\s*Approve\s*</);
  });

  it("links an approver who may not open the claim to the To approve list instead, and skips one who may open neither", async () => {
    holders = ["person-employer", "person-stand-in"];
    mayOpen.add(`person-stand-in ${TO_APPROVE}`);
    people(
      { id: "person-employer", email: "employer@example.test", first_name: "Drew" },
      { id: "person-stand-in", email: "standin@example.test", first_name: "Ha" },
      { id: PERSON_A, display_name: "Avery Stone" },
    );
    await tellApproversOfCheck(checked);
    expect(sent.map((s) => s.to)).toEqual(["standin@example.test"]);
    expect(String(sent[0].html)).toContain(`https://example.test${TO_APPROVE}`);
  });

  it("leaves out the checker, and the owner unless they may decide their own claim", async () => {
    holders = ["person-finance", PERSON_A];
    mayOpen.add(`person-finance ${CLAIM_PAGE}`).add(`${PERSON_A} ${CLAIM_PAGE}`);
    people({ id: PERSON_A, email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" });
    await tellApproversOfCheck(checked);
    expect(sent).toHaveLength(0);

    decidesOwn.add(PERSON_A);
    people({ id: PERSON_A, email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" });
    await tellApproversOfCheck(checked);
    expect(sent.map((s) => s.to)).toEqual(["a@example.test"]);
  });

  it("sends nothing when nobody holds the permission, and never throws", async () => {
    await tellApproversOfCheck(checked);
    expect(sent).toHaveLength(0);
    holders = ["person-employer"];
    script("people", { error: { message: "db down" } });
    await expect(tellApproversOfCheck(checked)).resolves.toBeUndefined();
  });
});

describe("tellOwnerOfDecision", () => {
  it("emails the owner the reason and a link to their claim, once per history row", async () => {
    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", preferred_name: null, full_name: null, first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    await tellOwnerOfDecision(decision);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "a@example.test", subject: "Sent back: Hanoi <workshop>", idempotencyKey: "claim:claim-1:event-7" });
    const html = String(sent[0].html);
    expect(html).toContain("Hi Avery,");
    expect(html).toContain("The taxi receipt is unreadable &amp; blurry.");
    expect(html).toContain("Hanoi &lt;workshop&gt;");
    expect(html).toContain("https://example.test/team/claims/claim-1");
  });

  it("names the step that decided, never a team or a person: the checker, or the approver", async () => {
    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    await tellOwnerOfDecision(decision);
    expect(String(sent[0].html)).toContain("was sent back to you by the checker");

    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    await tellOwnerOfDecision({ ...decision, became: "rejected", step: "approval" });
    const html = String(sent[1].html);
    expect(html).toContain("was rejected by the approver");
    expect(html).not.toMatch(/Finance/);
  });

  it("says a rejection is final", async () => {
    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    await tellOwnerOfDecision({ ...decision, became: "rejected" });
    expect(sent[0]).toMatchObject({ subject: "Rejected: Hanoi <workshop>" });
    expect(String(sent[0].html)).toContain("will not be paid");
  });

  it("sends nothing to an owner who may not open their claim's page", async () => {
    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    await tellOwnerOfDecision(decision);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing to an owner with no address, and sends unkeyed when the history row is missing", async () => {
    script("people", { data: { email: null, display_name: "Avery Stone" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    await tellOwnerOfDecision(decision);
    expect(sent).toHaveLength(0);

    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    await tellOwnerOfDecision({ ...decision, eventId: null });
    expect(sent[0].idempotencyKey).toBeUndefined();
  });

  it("never throws: the decision has landed whatever the email does", async () => {
    script("people", { data: { email: "a@example.test", display_name: "Avery Stone", first_name: "Avery" } });
    mayOpen.add(`${PERSON_A} /team/claims/claim-1`);
    transportFails = true;
    await expect(tellOwnerOfDecision(decision)).resolves.toBeUndefined();
    script("people", { error: { message: "db down" } });
    await expect(tellOwnerOfDecision(decision)).resolves.toBeUndefined();
  });
});
