import { describe, expect, it } from "vitest";
import { amountText, receiptCheck, type ReviewedItem } from "./review-facts";
import type { StoredReading } from "./receipt-reading";
import { waitingFor } from "./claim-labels";

// What a decider reads off one receipt at a glance (RB.14): the claim and the
// AI reading compared field by field, and the one chip for it.
const reading = (over: Partial<StoredReading> = {}): StoredReading => ({
  amount_minor: 3300,
  currency: "AUD",
  bought_on: "2026-10-01",
  seller: "E Hungry Foods Pty Ltd",
  category: "meals_travel",
  is_red_invoice: false,
  buyer_name: null,
  buyer_tax_code: null,
  confidence: "high",
  notes: null,
  file_id: "file-1",
  read_at: "2026-10-08T05:22:14Z",
  ...over,
});
const item = (over: Partial<ReviewedItem> = {}): ReviewedItem => ({
  amount: 3300,
  currency: "aud",
  boughtOn: "2026-10-01",
  seller: "E Hungry Foods",
  category: "meals_travel",
  declined: false,
  removed: false,
  reading: reading(),
  flags: [],
  ...over,
});

describe("receiptCheck", () => {
  it("says Matches when the amount, currency and date agree, whatever the seller's spelling", () => {
    const check = receiptCheck(item());
    expect(check).toMatchObject({ tone: "ok", label: "Matches", hint: null });
    expect(check.rows.map((r) => [r.field, r.differs])).toEqual([
      ["Amount", false],
      ["Date", false],
      ["Seller", false],
      ["Category", false],
    ]);
  });

  it("says the date differs, and hints the AI read it month first, on a day-first receipt (the real dinner, 2026-10-08)", () => {
    const check = receiptCheck(item({ reading: reading({ bought_on: "2026-01-10" }) }));
    expect(check).toMatchObject({ tone: "warn", label: "Date differs" });
    expect(check.hint).toContain("month first");
  });

  it("gives no hint for a date that is simply different", () => {
    expect(receiptCheck(item({ reading: reading({ bought_on: "2026-09-28" }) })).hint).toBeNull();
  });

  it("calls a different amount, or the same figure in another currency, an amount difference", () => {
    expect(receiptCheck(item({ reading: reading({ amount_minor: 3800 }) })).label).toBe("Amount differs");
    expect(receiptCheck(item({ reading: reading({ currency: "USD" }) })).label).toBe("Amount differs");
    expect(receiptCheck(item({ reading: reading({ amount_minor: 3800, bought_on: "2026-09-28" }) })).label).toBe("Amount and date differ");
  });

  it("counts the reading's warnings when the figures agree", () => {
    expect(receiptCheck(item({ flags: ["possible_duplicate"] }))).toMatchObject({ tone: "warn", label: "1 warning" });
  });

  it("says what a decider already decided before anything the reading says", () => {
    expect(receiptCheck(item({ declined: true, reading: reading({ amount_minor: 1 }) }))).toMatchObject({ tone: "err", label: "Declined" });
    expect(receiptCheck(item({ removed: true }))).toMatchObject({ tone: "neutral", label: "Removed" });
  });

  it("says a receipt was not read, with nothing to compare", () => {
    // RB.17 (Mai): a receipt the AI has not read gets no chip at all.
    expect(receiptCheck(item({ reading: null }))).toEqual({ tone: "neutral", label: null, rows: [], hint: null });
  });
});

describe("amountText", () => {
  it("prints dong whole and other currencies with two decimals and their code", () => {
    expect(amountText(126000, "vnd")).toBe("126,000 ₫");
    expect(amountText(1386, "aud")).toBe("13.86 AUD");
    expect(amountText(null, "aud")).toBe("—");
  });
});

describe("waitingFor", () => {
  const now = new Date("2026-10-08T09:00:00Z");
  it("counts whole days at the stage and marks a claim past three days", () => {
    expect(waitingFor("2026-10-08T01:00:00Z", now)).toEqual({ label: "today", stale: false });
    expect(waitingFor("2026-10-07T08:00:00Z", now)).toEqual({ label: "1 day", stale: false });
    expect(waitingFor("2026-10-05T08:00:00Z", now)).toEqual({ label: "3 days", stale: false });
    expect(waitingFor("2026-10-03T08:00:00Z", now)).toEqual({ label: "5 days", stale: true });
    expect(waitingFor(null, now)).toBeNull();
  });
});
