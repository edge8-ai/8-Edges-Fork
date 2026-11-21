import { describe, expect, it } from "vitest";
import { approvalRefusal, claimFigure, figureItemOf, keptOf, NO_VND, type FigureItem } from "./claim-figure";
import { ALL_DECLINED } from "./claim-rules";

// RB.29: what a claim comes to, answered once. Every expected figure below is written
// out by hand from the rule in CONTEXT.md ("Claim total", "Settlement"), never summed
// the way the module sums, so a test cannot pass by repeating the code's arithmetic.
const kept = (amountVnd: number | null): FigureItem => ({ amountVnd, declined: false });
const declined = (amountVnd: number | null): FigureItem => ({ amountVnd, declined: true });
const removed = (amountVnd: number | null): FigureItem => ({ amountVnd, declined: false, removed: true });

describe("claimFigure", () => {
  const cases: { name: string; claim: Parameters<typeof claimFigure>[0]; figure: ReturnType<typeof claimFigure> }[] = [
    {
      name: "an open claim comes to its kept receipts, a declined one left out",
      claim: { status: "submitted", items: [kept(1_200_000), declined(800_000), kept(300_000)], approvedTotalVnd: null, settles: false },
      figure: { totalVnd: 1_500_000, paysVnd: null, final: false, ratePending: 0, declined: 1 },
    },
    {
      name: "a draft counts a receipt its owner removed as nothing, and not as declined",
      claim: { status: "draft", items: [kept(450_000), removed(9_000_000)], approvedTotalVnd: null, settles: false },
      figure: { totalVnd: 450_000, paysVnd: null, final: false, ratePending: 0, declined: 0 },
    },
    {
      name: "a receipt waiting for its rate counts as nothing so far, and is counted as waiting",
      claim: { status: "submitted", items: [kept(1_000_000), kept(null), kept(null)], approvedTotalVnd: null, settles: false },
      figure: { totalVnd: 1_000_000, paysVnd: null, final: false, ratePending: 2, declined: 0 },
    },
    {
      name: "a declined receipt waiting for a rate is not waiting on anything",
      claim: { status: "submitted", items: [kept(250_000), declined(null)], approvedTotalVnd: null, settles: false },
      figure: { totalVnd: 250_000, paysVnd: null, final: false, ratePending: 0, declined: 1 },
    },
    {
      name: "an approved claim is its frozen total, whatever its receipts now add up to",
      claim: { status: "approved", items: [kept(1_000_000), kept(999)], approvedTotalVnd: 1_000_000, settles: false },
      figure: { totalVnd: 1_000_000, paysVnd: 1_000_000, final: true, ratePending: 0, declined: 0 },
    },
    {
      name: "a paid claim stays at what it was approved at",
      claim: { status: "paid", items: [kept(2_000_000), declined(400_000)], approvedTotalVnd: 2_000_000, settles: false },
      figure: { totalVnd: 2_000_000, paysVnd: 2_000_000, final: true, ratePending: 0, declined: 1 },
    },
    {
      name: "a checked claim is not frozen yet",
      claim: { status: "checked", items: [kept(6_000_000)], approvedTotalVnd: null, settles: false },
      figure: { totalVnd: 6_000_000, paysVnd: null, final: false, ratePending: 0, declined: 0 },
    },
    {
      name: "a settlement that spent more than its advance comes to what was spent; a run pays the difference",
      claim: { status: "approved", items: [kept(7_000_000), kept(1_500_000)], approvedTotalVnd: 500_000, settles: true },
      figure: { totalVnd: 8_500_000, paysVnd: 500_000, final: true, ratePending: 0, declined: 0 },
    },
    {
      name: "a settlement that spent exactly its advance comes to what was spent and pays nothing",
      claim: { status: "settled", items: [kept(8_000_000)], approvedTotalVnd: 0, settles: true },
      figure: { totalVnd: 8_000_000, paysVnd: 0, final: true, ratePending: 0, declined: 0 },
    },
    {
      name: "a settlement that spent less than its advance comes to what was spent and pays nothing",
      claim: { status: "settled", items: [kept(3_000_000), declined(2_000_000)], approvedTotalVnd: 0, settles: true },
      figure: { totalVnd: 3_000_000, paysVnd: 0, final: true, ratePending: 0, declined: 1 },
    },
    {
      name: "a settlement still being checked comes to what is spent so far",
      claim: { status: "submitted", items: [kept(4_000_000), kept(null)], approvedTotalVnd: null, settles: true },
      figure: { totalVnd: 4_000_000, paysVnd: null, final: false, ratePending: 1, declined: 0 },
    },
  ];

  it.each(cases)("$name", ({ claim, figure }) => {
    expect(claimFigure(claim)).toEqual(figure);
  });
});

describe("approvalRefusal", () => {
  it("refuses a claim whose every receipt left is declined, which is a rejection", () => {
    expect(approvalRefusal([declined(126_000), removed(900_000)])).toBe(ALL_DECLINED);
  });

  it("lets a settlement decline everything: nothing was spent and all of it comes back", () => {
    expect(approvalRefusal([declined(126_000)], { settlement: true })).toBeNull();
  });

  it("refuses a kept receipt with no value yet, and not a declined one", () => {
    expect(approvalRefusal([kept(1_000_000), kept(null)])).toBe(NO_VND);
    expect(approvalRefusal([kept(1_000_000), declined(null)])).toBeNull();
  });

  it("names the every-declined refusal before the missing value", () => {
    expect(approvalRefusal([declined(null)])).toBe(ALL_DECLINED);
  });

  it("refuses nothing on a claim with no receipt at all, which the submit rules already stop", () => {
    expect(approvalRefusal([])).toBeNull();
  });
});

describe("keptOf and figureItemOf", () => {
  it("reads a row as the reads select it", () => {
    expect(figureItemOf({ amount_vnd: "1250000", declined_at: null, removed_at: null })).toEqual({ amountVnd: 1_250_000, declined: false, removed: false });
    expect(figureItemOf({ amount_vnd: null, declined_at: "2026-11-01T03:00:00Z", removed_at: "2026-11-02T03:00:00Z" })).toEqual({ amountVnd: null, declined: true, removed: true });
  });

  it("keeps the receipts not declined and not removed", () => {
    expect(keptOf([kept(100_000), declined(50_000), removed(70_000), kept(null)])).toEqual({ totalVnd: 100_000, declined: 1, ratePending: 1 });
  });
});
