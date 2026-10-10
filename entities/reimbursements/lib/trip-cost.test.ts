import { describe, expect, it } from "vitest";
import { tripCostOf } from "./trip-cost";

// What a trip cost in paid claims (RB.12): by person at what each claim was
// paid, by category from the receipts kept, declined ones left out.
describe("tripCostOf", () => {
  it("sums the paid claims by person and their kept receipts by category", () => {
    const cost = tripCostOf(
      [
        { id: "c1", ownerName: "Avery", approvedTotalVnd: 1_000_000 },
        { id: "c2", ownerName: "Casey", approvedTotalVnd: 400_000 },
        { id: "c3", ownerName: "Avery", approvedTotalVnd: 200_000 },
      ],
      [
        { claimId: "c1", category: "transport", amountVnd: 600_000, declined: false, removed: false },
        { claimId: "c1", category: "accommodation", amountVnd: 400_000, declined: false, removed: false },
        { claimId: "c1", category: "other", amountVnd: 90_000, declined: true, removed: false },
        // Removed by its owner before the claim was approved (20261008090000): never paid, never a cost.
        { claimId: "c1", category: "training_events", amountVnd: 300_000, declined: false, removed: true },
        { claimId: "c2", category: "transport", amountVnd: 400_000, declined: false, removed: false },
        { claimId: "c3", category: "meals_travel", amountVnd: 200_000, declined: false, removed: false },
      ],
    );
    expect(cost.claims).toBe(3);
    expect(cost.totalVnd).toBe(1_600_000);
    expect(cost.byPerson).toEqual([
      { label: "Avery", vnd: 1_200_000 },
      { label: "Casey", vnd: 400_000 },
    ]);
    expect(cost.byCategory.map((l) => l.vnd)).toEqual([1_000_000, 400_000, 200_000]);
    expect(cost.byCategory.reduce((s, l) => s + l.vnd, 0)).toBe(cost.totalVnd);
  });

  it("is nothing for a trip with no paid claim", () => {
    expect(tripCostOf([], [])).toEqual({ claims: 0, totalVnd: 0, byCategory: [], byPerson: [] });
  });
});
