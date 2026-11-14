import { describe, expect, it } from "vitest";
import { proposalOutcome } from "./proposals";

describe("proposalOutcome", () => {
  it("books a first 1-1 at once: never met, nothing booked", () => {
    expect(proposalOutcome({ hasMet: false, hasBooking: false })).toBe("confirmed");
  });
  it("waits for the coach once the pair has met, even with nothing booked", () => {
    // "Nothing booked" is the normal state between 1-1s (ADR-0010), so a member
    // who could book whenever nothing was booked would book into their coach's
    // day every cycle.
    expect(proposalOutcome({ hasMet: true, hasBooking: false })).toBe("proposed");
  });
  it("waits for the coach when a 1-1 is booked: the member is asking to move it", () => {
    expect(proposalOutcome({ hasMet: false, hasBooking: true })).toBe("proposed");
    expect(proposalOutcome({ hasMet: true, hasBooking: true })).toBe("proposed");
  });
});
