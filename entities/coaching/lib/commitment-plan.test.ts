import { describe, expect, it } from "vitest";
import { PLAN_MAX, normalisePlan } from "./commitment-plan";

describe("normalisePlan", () => {
  it("keeps what the member wrote", () => {
    expect(normalisePlan("After Thursday standup, I'll block the two hours before lunch")).toBe(
      "After Thursday standup, I'll block the two hours before lunch",
    );
  });

  it("treats nothing, and whitespace, as no plan", () => {
    // "No plan" and "a blank plan" read identically, so they are stored
    // identically — otherwise every caller has to ask plan?.trim().
    expect(normalisePlan("")).toBeNull();
    expect(normalisePlan("   \n  ")).toBeNull();
    expect(normalisePlan(null)).toBeNull();
    expect(normalisePlan(undefined)).toBeNull();
  });

  it("trims what was typed", () => {
    expect(normalisePlan("  after standup  ")).toBe("after standup");
  });

  it("caps a plan so a card stays a card", () => {
    expect(normalisePlan("x".repeat(PLAN_MAX + 100))).toHaveLength(PLAN_MAX);
  });
});
