import { describe, expect, it } from "vitest";
import { CLAIM_MOVES, CLAIM_STATUSES, DECIDER_MOVES, boughtInVietnamByDefault, canSubmit, checkRefusal, decidingStep, itemValue, nextClaimStatus, nextRunDate, olderThan90Days, ownerCan, statusLine, type ClaimActorKind, type ClaimMove, type ClaimStatus, type SubmitItem } from "./claim-rules";
import { stillCounted } from "./retention-rules";

// The claim's state machine (design §1.2) as one pure table. Every status ×
// move × actor kind is asked; the arrows below are the plan's diagram plus the
// payer's return to approved (§4.5), and everything not listed is refused.
const ARROWS: [ClaimStatus, ClaimMove, ClaimActorKind, ClaimStatus][] = [
  ["draft", "submit", "owner", "submitted"],
  ["sent_back", "submit", "owner", "submitted"],
  ["submitted", "withdraw", "owner", "draft"],
  ["submitted", "check", "checker", "checked"],
  ["submitted", "send_back", "checker", "sent_back"],
  ["submitted", "reject", "checker", "rejected"],
  ["checked", "approve", "approver", "approved"],
  ["checked", "send_back", "approver", "sent_back"],
  ["checked", "reject", "approver", "rejected"],
  ["approved", "enter_run", "cron", "in_run"],
  ["in_run", "pay", "payer", "paid"],
  ["in_run", "return_to_approved", "payer", "approved"],
];
// Asking for the state a claim is already in is answered without a write, but
// only for the owner's moves and the cron's: a second click, two tabs, a rerun.
// A repeated decision (a check, an approval, a payment) is refused instead,
// because a second checker racing the first must not be told theirs was
// recorded when nothing was recorded under their name.
const NOOPS: [ClaimStatus, ClaimMove, ClaimActorKind][] = [
  ["submitted", "submit", "owner"],
  ["draft", "withdraw", "owner"],
  ["in_run", "enter_run", "cron"],
];
const MOVES: ClaimMove[] = ["submit", "withdraw", "check", "send_back", "reject", "approve", "enter_run", "pay", "return_to_approved"];
const ACTORS: ClaimActorKind[] = ["owner", "checker", "approver", "payer", "cron"];

describe("DECIDER_MOVES", () => {
  it("lists exactly the moves each decider's arrows allow, so the actions' whitelist follows the diagram", () => {
    for (const actor of ["checker", "approver"] as const) {
      const allowed = CLAIM_MOVES.filter((m) => CLAIM_STATUSES.some((s) => nextClaimStatus(s, m, actor).outcome === "apply"));
      expect([...DECIDER_MOVES[actor]].sort()).toEqual([...allowed].sort());
    }
  });
});

describe("nextClaimStatus", () => {
  for (const from of CLAIM_STATUSES) {
    for (const move of MOVES) {
      for (const actor of ACTORS) {
        const arrow = ARROWS.find(([f, m, a]) => f === from && m === move && a === actor);
        const noop = NOOPS.some(([f, m, a]) => f === from && m === move && a === actor);
        const expected = arrow ? `apply ${arrow[3]}` : noop ? "noop" : "refuse";
        it(`${actor} ${move} on ${from}: ${expected}`, () => {
          const next = nextClaimStatus(from, move, actor);
          const got = next.outcome === "apply" ? `apply ${next.status}` : next.outcome;
          expect(got).toBe(expected);
          if (next.outcome === "refuse") expect(next.error).toMatch(/\S/);
        });
      }
    }
  }

  it("names who may make a move when the wrong actor asks", () => {
    expect(nextClaimStatus("submitted", "check", "owner")).toEqual({ outcome: "refuse", error: "Only a checker can check a claim." });
    expect(nextClaimStatus("approved", "enter_run", "payer")).toEqual({ outcome: "refuse", error: "Only the payment run puts a claim in a run." });
  });

  it("refuses a repeated decision and says it was already made", () => {
    expect(nextClaimStatus("checked", "check", "checker")).toEqual({ outcome: "refuse", error: "This claim is already checked." });
    expect(nextClaimStatus("approved", "approve", "approver")).toEqual({ outcome: "refuse", error: "This claim is already approved." });
    expect(nextClaimStatus("paid", "pay", "payer")).toEqual({ outcome: "refuse", error: "This claim is already paid." });
  });

  it("names the step a decision is made at from the status it leaves: the check, or the approval", () => {
    expect(decidingStep("submitted")).toBe("check");
    expect(decidingStep("checked")).toBe("approval");
  });

  it("says why an owner cannot withdraw a claim that was already checked", () => {
    expect(nextClaimStatus("checked", "withdraw", "owner")).toEqual({
      outcome: "refuse",
      error: "This claim has been checked, so it can no longer be withdrawn.",
    });
  });
});

describe("ownerCan", () => {
  it("edits and submits a draft or a sent-back claim, withdraws a submitted one, and deletes only a never-submitted draft", () => {
    expect(ownerCan({ status: "draft", submittedAt: null })).toEqual({ edit: true, submit: true, withdraw: false, delete: true, remove: "delete" });
    // Withdrawn after a submission: a draft again, but kept for ten years.
    expect(ownerCan({ status: "draft", submittedAt: "2026-10-01T03:00:00Z" })).toEqual({ edit: true, submit: true, withdraw: false, delete: false, remove: "mark" });
    expect(ownerCan({ status: "submitted", submittedAt: "2026-10-01T03:00:00Z" })).toEqual({ edit: false, submit: false, withdraw: true, delete: false, remove: null });
    expect(ownerCan({ status: "sent_back", submittedAt: "2026-10-01T03:00:00Z" })).toEqual({ edit: true, submit: true, withdraw: false, delete: false, remove: "mark" });
    for (const status of ["checked", "rejected", "approved", "in_run", "paid"] as const) {
      expect(ownerCan({ status, submittedAt: "2026-10-01T03:00:00Z" })).toEqual({ edit: false, submit: false, withdraw: false, delete: false, remove: null });
    }
  });

  // Plan §10 and 20261008090000: an item or a document of a claim that was
  // ever submitted is never deleted, by anyone; the owner marks it removed or
  // replaced instead. The database refuses the delete on the same fact
  // (`submitted_at`), so the product offers delete exactly where it allows one.
  it("deletes a receipt or a document only from a never-submitted draft, and marks it everywhere else the owner may change", () => {
    expect(ownerCan({ status: "draft", submittedAt: null }).remove).toBe("delete");
    expect(ownerCan({ status: "draft", submittedAt: "2026-10-01T03:00:00Z" }).remove).toBe("mark");
    expect(ownerCan({ status: "sent_back", submittedAt: "2026-10-01T03:00:00Z" }).remove).toBe("mark");
  });
});

describe("stillCounted", () => {
  it("keeps the rows nobody removed: a removed item stays on the claim but counts toward nothing", () => {
    const rows = [{ id: "a", removed_at: null }, { id: "b", removed_at: "2026-10-08T03:00:00Z" }, { id: "c" }];
    expect(stillCounted(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("itemValue", () => {
  const rate = { rate: 18426, source: "techcombank" as const, asOf: "2026-10-03" };

  it("values a dong receipt at itself, needing no rate", () => {
    expect(itemValue({ amount: 126000, currency: "vnd", chargedVnd: null, rate: null })).toEqual({
      amount_vnd: 126000,
      fx_rate: 1,
      fx_source: "none",
      fx_as_of: null,
      charged_vnd: null,
    });
  });

  it("converts a receipt abroad at the bank's rate and stamps where the rate came from", () => {
    expect(itemValue({ amount: 6280, currency: "aud", chargedVnd: null, rate })).toEqual({
      amount_vnd: 1157153,
      fx_rate: 18426,
      fx_source: "techcombank",
      fx_as_of: "2026-10-03",
      charged_vnd: null,
    });
  });

  it("lets what the card actually charged win over the rate", () => {
    expect(itemValue({ amount: 6280, currency: "aud", chargedVnd: 1_170_000, rate })).toEqual({
      amount_vnd: 1_170_000,
      fx_rate: 18630.573248,
      fx_source: "card",
      fx_as_of: null,
      charged_vnd: 1_170_000,
    });
  });

  it("leaves a receipt abroad with no rate and no card charge without a value: rate pending", () => {
    expect(itemValue({ amount: 6280, currency: "aud", chargedVnd: null, rate: null })).toEqual({
      amount_vnd: null,
      fx_rate: null,
      fx_source: "none",
      fx_as_of: null,
      charged_vnd: null,
    });
  });
});

describe("checkRefusal", () => {
  it("refuses to check a claim with a receipt whose rate is pending", () => {
    expect(checkRefusal([{ label: "13cabs · 4 Oct", amountVnd: null, declined: false }])).toBe(
      "13cabs · 4 Oct: rate pending. Enter the rate by hand, or decline the receipt, before checking.",
    );
  });

  it("refuses to check a claim whose every receipt is declined: there is nothing left to pay, so it is a rejection", () => {
    expect(checkRefusal([{ label: "Grab", amountVnd: 126000, declined: true }, { label: "13cabs · 4 Oct", amountVnd: null, declined: true }])).toBe(
      "Every receipt is declined: reject the claim instead.",
    );
  });

  it("lets a declined receipt with no rate through: it is not paid", () => {
    expect(checkRefusal([{ label: "13cabs · 4 Oct", amountVnd: null, declined: true }, { label: "Grab", amountVnd: 126000, declined: false }])).toBeNull();
  });
});

const receipt = { kind: "receipt" as const, confirmed: true, mimeType: "image/jpeg", replaced: false };
const redInvoice = { kind: "red_invoice" as const, confirmed: true, mimeType: "application/pdf", replaced: false };
const item = (over: Partial<SubmitItem> = {}): SubmitItem => ({
  label: "Grab · 2 Oct",
  category: "other",
  currency: "vnd",
  amount: 126000,
  boughtInVietnam: true,
  lostReceiptNote: null,
  removed: false,
  documents: [redInvoice],
  ...over,
});

describe("canSubmit", () => {
  it("passes a titled claim whose every item is VND, has an amount and a confirmed document", () => {
    expect(canSubmit({ title: "Hanoi client workshop", items: [item(), item({ label: "Phở Thìn · 5 Oct" })], bankDetailsOnFile: true })).toEqual({ ok: true });
  });

  it("passes a receipt in another currency: its rate can still be pending, which the checker settles", () => {
    const abroad = item({ currency: "aud", amount: 6280, boughtInVietnam: false, documents: [receipt], label: "13cabs · 4 Oct" });
    expect(canSubmit({ title: "Melbourne", items: [abroad], bankDetailsOnFile: true })).toEqual({ ok: true });
  });

  it("lists every reason it cannot be submitted yet", () => {
    const answer = canSubmit({
      title: "  ",
      bankDetailsOnFile: false,
      items: [
        item({ amount: 0, label: "Printing · 1 Oct" }),
        item({ documents: [], label: "Grab · 2 Oct" }),
        item({ documents: [{ ...redInvoice, confirmed: false }], label: "Highlands · 3 Oct" }),
      ],
    });
    expect(answer).toEqual({
      ok: false,
      reasons: [
        "Give the claim a title.",
        "Printing · 1 Oct needs an amount.",
        "Grab · 2 Oct was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF.",
        "Highlands · 3 Oct was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF.",
        "Add your bank details before submitting.",
      ],
    });
  });

  // RB.5: a claim is paid by transfer, so nobody may submit one Finance could
  // not pay: a bank's name and an account number must be on file.
  it("refuses a claim whose owner has no bank details on file", () => {
    expect(canSubmit({ title: "Hanoi client workshop", items: [item()], bankDetailsOnFile: false })).toEqual({
      ok: false,
      reasons: ["Add your bank details before submitting."],
    });
  });

  it("refuses a claim with no items", () => {
    expect(canSubmit({ title: "Empty", items: [], bankDetailsOnFile: true })).toEqual({ ok: false, reasons: ["Add at least one receipt."] });
  });

  // 20261008090000: a removed item stays on the claim and needs nothing; a
  // replaced document stays beside its item and satisfies nothing.
  describe("removed items and replaced documents", () => {
    it("asks nothing of a removed item, whatever it lacks", () => {
      const gone = item({ label: "Taxi · 1 Oct", removed: true, amount: 0, documents: [] });
      expect(canSubmit({ title: "Hanoi", items: [item(), gone], bankDetailsOnFile: true })).toEqual({ ok: true });
    });

    it("does not count a removed item as a receipt on the claim", () => {
      expect(canSubmit({ title: "Hanoi", items: [item({ removed: true })], bankDetailsOnFile: true })).toEqual({ ok: false, reasons: ["Add at least one receipt."] });
    });

    it("no longer lets a replaced red invoice satisfy the Vietnam rule", () => {
      expect(canSubmit({ title: "Hanoi", items: [item({ documents: [{ ...redInvoice, replaced: true }] })], bankDetailsOnFile: true })).toEqual({
        ok: false,
        reasons: ["Grab · 2 Oct was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF."],
      });
      expect(canSubmit({ title: "Hanoi", items: [item({ documents: [{ ...redInvoice, replaced: true }, redInvoice] })], bankDetailsOnFile: true })).toEqual({ ok: true });
    });

    it("no longer lets a replaced receipt document an item bought abroad", () => {
      const abroad = item({ boughtInVietnam: false, documents: [{ ...receipt, replaced: true }] });
      expect(canSubmit({ title: "Sydney", items: [abroad], bankDetailsOnFile: true })).toEqual({ ok: false, reasons: ["Grab · 2 Oct has no receipt: add one, or write why."] });
    });
  });

  it("accepts a written explanation for a lost receipt only on an item bought abroad", () => {
    const abroad = item({ boughtInVietnam: false, documents: [], lostReceiptNote: "Lost on the train." });
    expect(canSubmit({ title: "Trip", items: [abroad], bankDetailsOnFile: true })).toEqual({ ok: true });
    const home = item({ documents: [], lostReceiptNote: "Lost it." });
    expect(canSubmit({ title: "Trip", items: [home], bankDetailsOnFile: true })).toEqual({
      ok: false,
      reasons: ["Grab · 2 Oct was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF."],
    });
    const abroadSilent = item({ boughtInVietnam: false, documents: [], lostReceiptNote: "  " });
    expect(canSubmit({ title: "Trip", items: [abroadSilent], bankDetailsOnFile: true })).toEqual({
      ok: false,
      reasons: ["Grab · 2 Oct has no receipt: add one, or write why."],
    });
  });

  // The red-invoice matrix (design §2.5, RB.2). An item bought in Vietnam is
  // reimbursed against a confirmed PDF red invoice and nothing else; an item
  // bought abroad against any confirmed document, or a written explanation.
  describe("the red-invoice rule", () => {
    const vietnam = (documents: SubmitItem["documents"]) => canSubmit({ title: "Hanoi", items: [item({ documents })], bankDetailsOnFile: true });
    const abroad = (over: Partial<SubmitItem>) => canSubmit({ title: "Sydney", items: [item({ boughtInVietnam: false, ...over })], bankDetailsOnFile: true });
    const NEEDS_RED_INVOICE = "Grab · 2 Oct was bought in Vietnam, so it needs its red invoice: add the seller's e-invoice PDF.";
    const PHOTO_IS_A_RECEIPT = "Grab · 2 Oct was bought in Vietnam: a photo is a receipt, not a red invoice. Add the seller's e-invoice PDF.";

    it("passes a Vietnamese item with a confirmed PDF red invoice, with or without a receipt beside it", () => {
      expect(vietnam([redInvoice])).toEqual({ ok: true });
      expect(vietnam([receipt, redInvoice])).toEqual({ ok: true });
    });

    it("refuses a Vietnamese item whose only document is a photo receipt", () => {
      expect(vietnam([receipt])).toEqual({ ok: false, reasons: [PHOTO_IS_A_RECEIPT] });
    });

    it("refuses a Vietnamese item whose receipt is a PDF but not filed as a red invoice", () => {
      expect(vietnam([{ kind: "receipt", confirmed: true, mimeType: "application/pdf", replaced: false }])).toEqual({ ok: false, reasons: [NEEDS_RED_INVOICE] });
    });

    it("refuses a Vietnamese item with no document, or a red invoice whose upload is unfinished", () => {
      expect(vietnam([])).toEqual({ ok: false, reasons: [NEEDS_RED_INVOICE] });
      expect(vietnam([{ ...redInvoice, confirmed: false }])).toEqual({ ok: false, reasons: [NEEDS_RED_INVOICE] });
    });

    it("refuses a red invoice row that is not a PDF, whatever its kind says", () => {
      expect(vietnam([{ kind: "red_invoice", confirmed: true, mimeType: "image/jpeg", replaced: false }])).toEqual({ ok: false, reasons: [PHOTO_IS_A_RECEIPT] });
      expect(vietnam([{ kind: "red_invoice", confirmed: true, mimeType: null, replaced: false }])).toEqual({ ok: false, reasons: [NEEDS_RED_INVOICE] });
    });

    it("passes a foreign item with a receipt photo, or a note, and refuses one with neither", () => {
      expect(abroad({ documents: [receipt] })).toEqual({ ok: true });
      expect(abroad({ documents: [], lostReceiptNote: "Lost on the train." })).toEqual({ ok: true });
      expect(abroad({ documents: [] })).toEqual({ ok: false, reasons: ["Grab · 2 Oct has no receipt: add one, or write why."] });
    });
  });

  // RB.15 (Mai, 2026-10-09): a ride with the person's own driver has no
  // invoice and often no receipt; the driver is paid another way. Transport
  // takes a red invoice when there is one and asks for nothing when there is not.
  describe("transport", () => {
    const ride = (over: Partial<SubmitItem>) => canSubmit({ title: "Hanoi", items: [item({ category: "transport", ...over })], bankDetailsOnFile: true });

    it("passes a Vietnamese ride with no document at all, with or without a note naming the driver", () => {
      expect(ride({ documents: [] })).toEqual({ ok: true });
      expect(ride({ documents: [], lostReceiptNote: "Own driver, anh Tuấn" })).toEqual({ ok: true });
    });

    it("passes a Vietnamese ride with a photo receipt or a red invoice", () => {
      expect(ride({ documents: [receipt] })).toEqual({ ok: true });
      expect(ride({ documents: [redInvoice] })).toEqual({ ok: true });
    });

    it("passes a ride abroad with no document and no note", () => {
      expect(ride({ boughtInVietnam: false, currency: "aud", documents: [] })).toEqual({ ok: true });
    });

    it("still asks a ride for its amount", () => {
      expect(ride({ documents: [], amount: 0 })).toEqual({ ok: false, reasons: ["Grab · 2 Oct needs an amount."] });
    });
  });
});

describe("boughtInVietnamByDefault", () => {
  it("starts a dong receipt as bought in Vietnam and any other currency as bought abroad", () => {
    expect(boughtInVietnamByDefault("vnd")).toBe(true);
    expect(boughtInVietnamByDefault("VND")).toBe(true);
    expect(boughtInVietnamByDefault("aud")).toBe(false);
    expect(boughtInVietnamByDefault("usd")).toBe(false);
  });
});

describe("nextRunDate", () => {
  // The cut-off is 00:00 Vietnam time on the run date, so a claim approved on
  // the 14th (Vietnam) is in the 15th's run, and one approved on the 15th waits.
  it("is the first 1st or 15th after the day the claim was approved, in Vietnam", () => {
    expect(nextRunDate("2026-10-14T16:59:00Z")).toBe("2026-10-15"); // 23:59 on the 14th in Vietnam
    expect(nextRunDate("2026-10-14T17:00:00Z")).toBe("2026-11-01"); // 00:00 on the 15th in Vietnam
    expect(nextRunDate("2026-10-31T10:00:00Z")).toBe("2026-11-01");
    expect(nextRunDate("2026-12-20T10:00:00Z")).toBe("2027-01-01");
    expect(nextRunDate("2026-10-01T10:00:00Z")).toBe("2026-10-15");
  });
});

describe("statusLine", () => {
  it("says what the plan's section 3 says for each state", () => {
    expect(statusLine({ status: "draft" })).toBe("Not sent yet.");
    expect(statusLine({ status: "submitted" })).toBe("Being checked by Finance / Accounting.");
    expect(statusLine({ status: "checked" })).toBe("Checked – waiting for approval.");
    expect(statusLine({ status: "sent_back", decidedBy: "Finley", reason: "Wrong invoice." })).toBe("Sent back by Finley: Wrong invoice.");
    expect(statusLine({ status: "rejected", decidedBy: "Finley", reason: "Personal purchase." })).toBe("Rejected by Finley: Personal purchase.");
    expect(statusLine({ status: "approved", approvedTotalVnd: 4850000, approvedAt: "2026-10-10T03:00:00Z" })).toBe(
      "Approved: ₫4,850,000. Will be paid in the run on Oct 15, 2026.",
    );
    expect(statusLine({ status: "in_run", runDate: "2026-10-15" })).toBe("In the Oct 15, 2026 run – payment on its way.");
    expect(statusLine({ status: "paid", paidVnd: 4850000, paidAt: "2026-10-16T03:00:00Z" })).toBe("Paid ₫4,850,000 on Oct 16, 2026.");
  });

  it("still reads when the decision's details are missing", () => {
    expect(statusLine({ status: "sent_back" })).toBe("Sent back to you to fix and resubmit.");
    expect(statusLine({ status: "rejected" })).toBe("Rejected.");
  });
});

describe("olderThan90Days", () => {
  // The plan's 90-day rule is a gentle label, never a refusal (RB.11): the
  // receipt's date against the day the claim was submitted, or today while it
  // is still a draft.
  it("labels a receipt bought more than 90 days before the day it is judged on", () => {
    expect(olderThan90Days("2026-07-08", "2026-10-07")).toBe(true);
    expect(olderThan90Days("2026-07-09", "2026-10-07")).toBe(false);
    expect(olderThan90Days("2026-10-01", "2026-10-07")).toBe(false);
  });

  it("says nothing about a receipt with no date", () => {
    expect(olderThan90Days(null, "2026-10-07")).toBe(false);
  });
});
