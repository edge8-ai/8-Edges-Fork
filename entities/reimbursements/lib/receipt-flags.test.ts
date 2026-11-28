import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import { RECEIPT_FLAG_LABEL, STORED_RECEIPT_FLAG_LABEL, receiptFlagsOf, type ReceiptFlag, type StoredReceiptFlag } from "./claim-labels";
import { CASH_FLAG_FROM_VND, itemFlagsOf } from "./receipt-flags";

// AD.15 (design Q8): the tax rule for a purchase paid in cash, on any claim. A warning worked out
// on each read, so an owner who changes the amount or how it was paid never leaves a stale flag.
describe("itemFlagsOf", () => {
  it("flags cash from the limit up, and not one dong under it", () => {
    expect(itemFlagsOf({ ai_flags: [], paid_how: "cash", amount_vnd: CASH_FLAG_FROM_VND })).toEqual(["cash_at_limit"]);
    expect(itemFlagsOf({ ai_flags: [], paid_how: "cash", amount_vnd: CASH_FLAG_FROM_VND + 1 })).toEqual(["cash_at_limit"]);
    expect(itemFlagsOf({ ai_flags: [], paid_how: "cash", amount_vnd: CASH_FLAG_FROM_VND - 1 })).toEqual([]);
  });

  it("raises nothing for a transfer, a card, or a receipt nobody said how was paid", () => {
    for (const paid_how of ["transfer", "card", null, undefined]) {
      expect(itemFlagsOf({ ai_flags: [], paid_how, amount_vnd: 50_000_000 })).toEqual([]);
    }
  });

  it("raises nothing while a rate is pending: there is no value to compare", () => {
    expect(itemFlagsOf({ ai_flags: [], paid_how: "cash", amount_vnd: null })).toEqual([]);
  });

  it("keeps what the reading stored, beside the cash flag and without it", () => {
    expect(itemFlagsOf({ ai_flags: ["unreadable"], paid_how: "cash", amount_vnd: 6_000_000 })).toEqual(["unreadable", "cash_at_limit"]);
    expect(itemFlagsOf({ ai_flags: ["unreadable"], paid_how: "card", amount_vnd: 6_000_000 })).toEqual(["unreadable"]);
  });

  it("says the figure it compares with", () => {
    expect(RECEIPT_FLAG_LABEL.cash_at_limit).toContain(`₫${CASH_FLAG_FROM_VND.toLocaleString("en-US")}`);
  });
});

// The line between the two kinds of flag. Writing a flag worked out on read into `ai_flags` would
// make the database refuse the whole save, so a receipt's reading would be lost, and its value
// would go stale besides. Each of these fails if someone blurs the line.
describe("what ai_flags may hold", () => {
  it("is refused the cash flag by the compiler", () => {
    // The cash flag is worked out on each read and never stored. If the next line stops being a
    // compile error, flagsFor's result can carry it into the column, which refuses it.
    // @ts-expect-error
    const stored: StoredReceiptFlag = "cash_at_limit";
    const shown: ReceiptFlag = "cash_at_limit";
    expect(stored).toBe(shown);
  });

  it("does not list the cash flag among the stored ones", () => {
    expect(Object.keys(STORED_RECEIPT_FLAG_LABEL)).not.toContain("cash_at_limit");
    expect(Object.keys(RECEIPT_FLAG_LABEL)).toContain("cash_at_limit");
  });

  it("does not read the cash flag back from the column, so it cannot appear twice", () => {
    expect(receiptFlagsOf(["cash_at_limit", "unreadable", "toString"])).toEqual(["unreadable"]);
    expect(itemFlagsOf({ ai_flags: ["cash_at_limit"], paid_how: "cash", amount_vnd: 6_000_000 })).toEqual(["cash_at_limit"]);
    expect(itemFlagsOf({ ai_flags: ["cash_at_limit"], paid_how: "card", amount_vnd: 6_000_000 })).toEqual([]);
  });

  // The fork builds its database from one schema file and has no migrations.
  it.skipIf(isForkTree(process.cwd()))("matches the column's check constraint, in the newest migration that sets it", () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const sets = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .flatMap((f) => [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/check\s*\(+\s*ai_flags\s*<@\s*array\s*\[([^\]]*)\]/gi)].map((m) => m[1]));
    // Whatever way a later migration spells it, the newest one is the one this reads.
    const newest = sets.at(-1);
    expect(newest).toBeDefined();
    const allowed = [...(newest as string).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual(Object.keys(STORED_RECEIPT_FLAG_LABEL).sort());
  });
});
