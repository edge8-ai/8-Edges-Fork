import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Monday nudges (design §1.8): checkers hear about submitted claims and
// approvers about checked ones, each once, with a link to a queue they may
// open, and never about a claim of their own unless they may decide it.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const sent: Record<string, unknown>[] = [];
const refused = new Set<string>();
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: async (o: Record<string, unknown>) => (sent.push(o), !refused.has(String(o.to))) }));
vi.mock("@/kernel/config/site-origin", () => ({ getSiteOrigin: async () => "https://example.test" }));
const holders: Record<string, string[]> = {};
vi.mock("@/kernel/identity/people-holding", () => ({ peopleHolding: async (p: string) => holders[p] ?? [] }));
const decidesOwn = new Set<string>();
vi.mock("@/kernel/identity/access-of-person", () => ({
  accessOf: async (personId: string) => ({ personId, may: (p: string) => p === "reimbursements.decide-own" && decidesOwn.has(personId) }),
}));
const opens = new Set<string>();
vi.mock("@/kernel/identity/may-open", () => ({ mayOpen: (a: { personId: string } | null, href: string) => !!a && opens.has(`${a.personId} ${href}`) }));

import { sendMondayNudges, waitingOn } from "./nudges";

beforeEach(() => {
  resetFake();
  sent.length = 0;
  refused.clear();
  decidesOwn.clear();
  opens.clear();
  for (const k of Object.keys(holders)) delete holders[k];
});

describe("waitingOn", () => {
  it("leaves the person's own claims out unless they may decide their own", () => {
    const claims = [{ personId: "finance" }, { personId: "person-a" }];
    expect(waitingOn(claims, "finance", false)).toBe(1);
    expect(waitingOn(claims, "finance", true)).toBe(2);
  });
});

describe("sendMondayNudges", () => {
  it("emails each checker the count of submitted claims, and each approver the count of checked ones, with a queue link", async () => {
    holders["reimbursements.check"] = ["finance"];
    holders["reimbursements.approve"] = ["employer"];
    opens.add("finance /team/finance/claims/to-check");
    opens.add("employer /admin/finance/reimbursements/to-approve");
    script("reimbursement_claims", { data: [{ id: "c1", person_id: "person-a" }, { id: "c2", person_id: "person-c" }] }, { data: [{ id: "c3", person_id: "person-a" }] });
    script("people", { data: [{ id: "finance", email: "finance@example.test", full_name: "Finley" }] }, { data: [{ id: "employer", email: "employer@example.test", full_name: "Drew" }] });
    expect(await sendMondayNudges("2026-10-12")).toEqual({ check: 1, approve: 1, skipped: [], failed: [] });
    expect(sent.map((s) => [s.to, s.subject, s.idempotencyKey])).toEqual([
      ["finance@example.test", "Reimbursements: 2 claims wait to check", "reimbursements-nudge:2026-10-12:check:finance"],
      ["employer@example.test", "Reimbursements: 1 claim waits to approve", "reimbursements-nudge:2026-10-12:approve:employer"],
    ]);
    expect(String(sent[0].html)).toContain("https://example.test/team/finance/claims/to-check");
  });

  it("tells nobody about an empty queue, or about their own claim alone", async () => {
    holders["reimbursements.check"] = ["person-a"];
    opens.add("person-a /team/finance/claims/to-check");
    script("reimbursement_claims", { data: [{ id: "c1", person_id: "person-a" }] }, { data: [] });
    script("people", { data: [{ id: "person-a", email: "a@example.test", full_name: "Avery" }] });
    expect(await sendMondayNudges("2026-10-12")).toEqual({ check: 0, approve: 0, skipped: [], failed: [] });
    expect(sent).toEqual([]);
  });

  it("sends no email to a holder whose access reaches no queue page", async () => {
    holders["reimbursements.check"] = ["finance"];
    script("reimbursement_claims", { data: [{ id: "c1", person_id: "person-a" }] }, { data: [] });
    script("people", { data: [{ id: "finance", email: "finance@example.test", full_name: "Finley" }] });
    expect((await sendMondayNudges("2026-10-12")).check).toBe(0);
    expect(sent).toEqual([]);
  });

  it("raises on a failed read, so the run is an error rather than a quiet week", async () => {
    script("reimbursement_claims", { error: { message: "db down" } });
    await expect(sendMondayNudges("2026-10-12")).rejects.toThrow("db down");
  });

  // Y.23: a nudge the email service refused used to vanish from the count; it now names the person.
  it("names the person whose nudge email was refused, and counts only those that went", async () => {
    holders["reimbursements.check"] = ["finance"];
    opens.add("finance /team/finance/claims/to-check");
    refused.add("finance@example.test");
    script("reimbursement_claims", { data: [{ id: "c1", person_id: "person-a" }] }, { data: [] });
    script("people", { data: [{ id: "finance", email: "finance@example.test", first_name: "Finley" }] });
    expect(await sendMondayNudges("2026-10-12")).toEqual({ check: 0, approve: 0, skipped: [], failed: ["Finley: the check nudge email was not sent"] });
  });
});
