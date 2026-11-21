import { describe, expect, it } from "vitest";
import { homeTenure } from "./home-tenure";

describe("homeTenure (W.181)", () => {
  it("leads with onboarding for the first thirty days, with the day line counting them", () => {
    expect(homeTenure(0, "probation")).toEqual({ newHire: true, dayLabel: "Day 1 of your first 30" });
    expect(homeTenure(29, null)).toEqual({ newHire: true, dayLabel: "Day 30 of your first 30" });
  });

  it("stops on day 31 even while the person is still on probation (Derek's day 35)", () => {
    expect(homeTenure(34, "probation").newHire).toBe(false);
    expect(homeTenure(30, "probation").newHire).toBe(false);
  });

  it("still leads with onboarding before the first day, and for probation with no start date", () => {
    expect(homeTenure(-3, "pre_boarding")).toEqual({ newHire: true, dayLabel: "Starting soon" });
    expect(homeTenure(null, "probation")).toEqual({ newHire: true, dayLabel: "Welcome" });
    expect(homeTenure(null, "employed").newHire).toBe(false);
  });
});
