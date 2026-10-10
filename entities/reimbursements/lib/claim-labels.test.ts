import { describe, expect, it } from "vitest";
import { DOCUMENT_KIND_LABEL, describeClaimEvent, historyMilestones, isClaimId, rateLine } from "./claim-labels";

// The words every view of a claim uses for its history and its documents
// (design §1.5: one claim view for the owner, the checker, the approver, the
// payer and the admin). One table, so two pages can no longer name the same
// move two ways, as the owner's and the checker's once did for the payment run.
describe("describeClaimEvent", () => {
  const event = (from: string | null, to: string) => ({ from, to }) as Parameters<typeof describeClaimEvent>[0];

  it.each([
    [null, "draft", "Started"],
    ["draft", "submitted", "Submitted"],
    ["sent_back", "submitted", "Resubmitted"],
    ["submitted", "draft", "Withdrawn to draft"],
    ["submitted", "checked", "Checked"],
    ["submitted", "sent_back", "Sent back"],
    ["checked", "rejected", "Rejected"],
    ["checked", "approved", "Approved"],
    ["approved", "in_run", "Added to a payment run"],
    ["in_run", "approved", "Payment returned; waiting for the next run"],
    ["in_run", "paid", "Paid"],
  ])("%s → %s reads %s", (from, to, words) => {
    expect(describeClaimEvent(event(from, to))).toBe(words);
  });
});

// RB.19 (Khoa and Mai): the history shows the milestones and nothing else:
// Submitted, Checked / Sent back / Rejected, Resubmitted, Approved, Paid. The
// draft's start, a withdrawal and the payment run's comings and goings stay
// in the events table for the audit trail; the card does not draw them.
describe("historyMilestones", () => {
  const ev = (from: string | null, to: string) => ({ from, to }) as Parameters<typeof describeClaimEvent>[0];

  it("keeps a claim's milestones in their order", () => {
    const path = [ev(null, "draft"), ev("draft", "submitted"), ev("submitted", "sent_back"), ev("sent_back", "submitted"), ev("submitted", "checked"), ev("checked", "approved"), ev("approved", "in_run"), ev("in_run", "paid")];
    expect(historyMilestones(path).map(describeClaimEvent)).toEqual(["Submitted", "Sent back", "Resubmitted", "Checked", "Approved", "Paid"]);
  });

  it("leaves out the start, a withdrawal, the payment run and a returned payment", () => {
    const noise = [ev(null, "draft"), ev("draft", "submitted"), ev("submitted", "draft"), ev("approved", "in_run"), ev("in_run", "approved")];
    expect(historyMilestones(noise).map(describeClaimEvent)).toEqual(["Submitted"]);
  });

  it("keeps a rejection, by the checker or the approver", () => {
    expect(historyMilestones([ev("submitted", "rejected"), ev("checked", "rejected")]).map(describeClaimEvent)).toEqual(["Rejected", "Rejected"]);
  });

  it("has nothing to show for a claim never submitted", () => {
    expect(historyMilestones([ev(null, "draft")])).toEqual([]);
  });
});

describe("DOCUMENT_KIND_LABEL", () => {
  it("names both kinds of document a receipt carries", () => {
    expect(DOCUMENT_KIND_LABEL).toEqual({ receipt: "Receipt", red_invoice: "Red invoice" });
  });
});

describe("isClaimId", () => {
  it("accepts a claim's uuid and nothing else, so a page can 404 before reading", () => {
    expect(isClaimId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isClaimId("not-a-claim")).toBe(false);
    expect(isClaimId("11111111-1111-4111-8111-11111111111")).toBe(false);
  });
});

describe("rateLine", () => {
  const item = (over: Partial<Parameters<typeof rateLine>[0]> = {}): Parameters<typeof rateLine>[0] => ({
    amount: 6280,
    currency: "aud",
    amountVnd: 1157153,
    fxRate: 18426,
    fxSource: "techcombank",
    fxAsOf: "2026-10-03",
    ...over,
  });

  it("says nothing for a dong receipt", () => {
    expect(rateLine(item({ currency: "vnd", amount: 126000, amountVnd: 126000, fxRate: 1, fxSource: "none", fxAsOf: null }))).toBeNull();
  });

  it("names the bank, its rate and the day for a receipt abroad", () => {
    expect(rateLine(item())).toBe("A$62.80 at Techcombank's selling rate of 18,426 on Oct 3, 2026");
    expect(rateLine(item({ fxSource: "vietcombank", fxRate: 279.52, currency: "inr", amount: 150000 }))).toBe(
      "₹1,500.00 at Vietcombank's selling rate of 279.52 on Oct 3, 2026",
    );
  });

  it("says when the card charge or a checker's rate is the value", () => {
    expect(rateLine(item({ fxSource: "card", amountVnd: 1170000, fxRate: 18630.573248, fxAsOf: null }))).toBe("A$62.80, as the card charged it");
    expect(rateLine(item({ fxSource: "manual", fxRate: 18400 }))).toBe("A$62.80 at 18,400, a rate entered by a checker");
  });

  it("says the rate is pending when there is no value yet", () => {
    expect(rateLine(item({ amountVnd: null, fxRate: null, fxSource: "none", fxAsOf: null }))).toBe("A$62.80, rate pending");
  });
});
