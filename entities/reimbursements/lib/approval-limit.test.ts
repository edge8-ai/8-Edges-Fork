import { describe, expect, it } from "vitest";
import { APPROVAL_LIMIT_VND, NO_REVIEW_LIMIT_USD, NO_REVIEW_LIMIT_VND, approvedOnCheck, needsNoReview } from "./approval-limit";

// RB.22: a claim under the limit is approved by its check; at or over it, it
// waits for an approver.
describe("approvedOnCheck", () => {
  it("approves a claim under the limit on its check", () => {
    expect(approvedOnCheck(640_000)).toBe(true);
    expect(approvedOnCheck(APPROVAL_LIMIT_VND - 1)).toBe(true);
    expect(approvedOnCheck(4_999_999)).toBe(true);
  });

  it("leaves a claim at or over the limit for an approver", () => {
    expect(approvedOnCheck(APPROVAL_LIMIT_VND)).toBe(false);
    expect(approvedOnCheck(5_000_000)).toBe(false);
    expect(approvedOnCheck(68_450_000)).toBe(false);
  });
});

describe("needsNoReview", () => {
  it("passes a claim under 1,000,000 and nothing at or over it", () => {
    expect(NO_REVIEW_LIMIT_VND).toBe(1_000_000);
    expect(needsNoReview(40_000)).toBe(true);
    expect(needsNoReview(999_999)).toBe(true);
    expect(needsNoReview(1_000_000)).toBe(false);
  });

  it("reads a claim with a foreign receipt at $50, and the VND limit when no rate is known", () => {
    expect(NO_REVIEW_LIMIT_USD).toBe(50);
    expect(needsNoReview(1_288_499, 25_770)).toBe(true);
    expect(needsNoReview(1_288_500, 25_770)).toBe(false);
    expect(needsNoReview(1_200_000, null)).toBe(false);
  });

  it("does not pass a claim that comes to nothing", () => {
    expect(needsNoReview(0)).toBe(false);
  });

  // The no-review path reaches approval through the check's own limit.
  it("stays under the approval limit, or a passed claim would stop at checked", () => {
    expect(NO_REVIEW_LIMIT_VND).toBeLessThanOrEqual(APPROVAL_LIMIT_VND);
  });
});
