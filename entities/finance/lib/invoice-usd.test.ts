import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { invoiceBalanceUsd, invoiceUnconverted, invoiceUsd, invoiceUsdColumns } from "./invoice-usd";

const row = (o: Partial<{ amount_cents: number | null; amount_usd_cents: number | null; balance_cents: number | null; balance_usd_cents: number | null; currency: string | null }>) => ({
  amount_cents: 0, amount_usd_cents: null, balance_cents: 0, balance_usd_cents: null, currency: "usd", ...o,
});

describe("an invoice's value in US dollars", () => {
  it("is the stored USD figure when the sync wrote one", () => {
    const aud = row({ amount_cents: 1_500_000, amount_usd_cents: 1_004_000, balance_cents: 1_500_000, balance_usd_cents: 1_004_000, currency: "aud" });
    expect(invoiceUsd(aud)).toBe(1_004_000);
    expect(invoiceBalanceUsd(aud)).toBe(1_004_000);
    expect(invoiceUnconverted(aud)).toBe(false);
  });

  it("is a USD invoice's own amount before the sync wrote one", () => {
    expect(invoiceUsd(row({ amount_cents: 50_000 }))).toBe(50_000);
    expect(invoiceBalanceUsd(row({ balance_cents: 20_000 }))).toBe(20_000);
  });

  it("is nothing, never the face value, for a foreign invoice not yet converted", () => {
    const aud = row({ amount_cents: 1_500_000, balance_cents: 1_500_000, currency: "aud" });
    expect(invoiceUsd(aud)).toBe(0);
    expect(invoiceBalanceUsd(aud)).toBe(0);
    expect(invoiceUnconverted(aud)).toBe(true);
  });

  it("nets a credit memo out rather than dropping it", () => {
    expect(invoiceUsd(row({ amount_cents: -20_000 }))).toBe(-20_000);
  });
});

describe("the USD columns the sync writes", () => {
  it("converts at the given rate", () => {
    expect(invoiceUsdColumns(1_500_000, 500_000, "aud", 0.6693)).toEqual({ amount_usd_cents: 1_003_950, balance_usd_cents: 334_650, fx_rate: 0.6693 });
  });
  it("is rate 1 for a USD invoice, whatever rate is passed", () => {
    expect(invoiceUsdColumns(120_000, 0, "USD", null)).toEqual({ amount_usd_cents: 120_000, balance_usd_cents: 0, fx_rate: 1 });
  });
  it("is null, not the face value, without a usable rate", () => {
    expect(invoiceUsdColumns(100_000, 0, "aud", null)).toEqual({ amount_usd_cents: null, balance_usd_cents: null, fx_rate: null });
    expect(invoiceUsdColumns(100_000, 0, "aud", 0)).toEqual({ amount_usd_cents: null, balance_usd_cents: null, fx_rate: null });
  });
});

// Adding amount_cents or balance_cents across invoices mixes currencies: that
// is how the Company Dashboard once counted A$15,000 as US$15,000. Every file
// that reads invoices sums them through invoiceUsd / invoiceBalanceUsd instead.
describe("no revenue code adds raw invoice amounts", () => {
  it("finds no `+ row.amount_cents` or `+ row.balance_cents` in a file that reads invoices", () => {
    const files = execFileSync("git", ["grep", "-l", "selectInvoices(", "--", "entities", "kernel"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !/\.test\.tsx?$/.test(f));
    const offenders = files.flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, n) => ({ f, n: n + 1, line }))
        .filter(({ line }) => /\+\s*\(?\s*\w+\.(amount|balance)_cents\b/.test(line))
        .map(({ f, n, line }) => `${f}:${n}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
