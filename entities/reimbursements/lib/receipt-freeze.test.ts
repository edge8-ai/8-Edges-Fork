import { describe, expect, it } from "vitest";
import { RECEIPT_FROZEN, RECEIPT_FROZEN_CODE, frozenByCheck, receiptWriteError } from "./receipt-freeze";

describe("the receipt freeze's refusal", () => {
  it("is told apart from every other database error by its own SQLSTATE", () => {
    expect(frozenByCheck({ code: RECEIPT_FROZEN_CODE })).toBe(true);
    // P0001 is the retention guards' (a delete), which keeps its own sentence.
    expect(frozenByCheck({ code: "P0001" })).toBe(false);
    expect(frozenByCheck({})).toBe(false);
    expect(frozenByCheck(null)).toBe(false);
  });

  it("reads as the freeze's sentence, and anything else as the caller's own", () => {
    expect(receiptWriteError({ message: "raw", code: RECEIPT_FROZEN_CODE }, "Could not save the receipt: raw")).toBe(RECEIPT_FROZEN);
    expect(receiptWriteError({ message: "db down" }, "Could not save the receipt: db down")).toBe("Could not save the receipt: db down");
  });

  // The migration raises this code; a typo on either side would turn every
  // refusal back into a raw database error, so the two are pinned together.
  it("matches the code the migration raises", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = "supabase/migrations";
    const file = readdirSync(dir).find((f) => f.endsWith("_reimbursement_receipts_frozen_once_checked.sql"));
    if (!file) return; // The migration ships in its own pull request (A.34.5); until it lands there is nothing to pin.
    expect(readFileSync(`${dir}/${file}`, "utf8")).toContain(`errcode = '${RECEIPT_FROZEN_CODE}'`);
  });
});
