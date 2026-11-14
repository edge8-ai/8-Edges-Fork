import { describe, expect, it } from "vitest";
import { summarizeToPay } from "./to-pay";

describe("summarizeToPay", () => {
  it("counts the waiting claims, their people and their total, and finds the oldest approval", () => {
    const got = summarizeToPay([
      { personId: "p1", approvedTotalVnd: 1_000_000, approvedAt: "2026-10-09T03:00:00Z" },
      { personId: "p2", approvedTotalVnd: 250_000, approvedAt: "2026-10-07T03:00:00Z" },
      { personId: "p1", approvedTotalVnd: 500_000, approvedAt: null },
    ]);
    expect(got).toEqual({ claims: 3, people: 2, totalVnd: 1_750_000, oldestApprovedAt: "2026-10-07T03:00:00Z" });
  });

  it("is empty when nothing waits", () => {
    expect(summarizeToPay([])).toEqual({ claims: 0, people: 0, totalVnd: 0, oldestApprovedAt: null });
  });
});
