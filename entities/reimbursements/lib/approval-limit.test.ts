import { describe, expect, it } from "vitest";
import { APPROVAL_LIMIT_VND, approvedOnCheck } from "./approval-limit";

// RB.22: a claim under the limit is approved by its check; at or over it, it
// waits for an approver.
describe("approvedOnCheck", () => {
  it("approves a claim under the limit on its check", () => {
    expect(approvedOnCheck(640_000)).toBe(true);
    expect(approvedOnCheck(APPROVAL_LIMIT_VND - 1)).toBe(true);
  });

  it("leaves a claim at or over the limit for an approver", () => {
    expect(approvedOnCheck(APPROVAL_LIMIT_VND)).toBe(false);
    expect(approvedOnCheck(68_450_000)).toBe(false);
  });
});
