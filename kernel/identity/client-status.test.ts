import { describe, expect, it } from "vitest";
import { clientStatus } from "./client-status";

const TODAY = "2026-09-15";
const dates = (start: string | null, end: string | null) => ({ client_start_date: start, client_end_date: end });

// clientTerm itself is pinned by entities/crm/lib/client-term.test.ts, which
// imports it through crm's re-export; these pin the status each term maps to.
describe("clientStatus", () => {
  it("is none without dates", () => {
    expect(clientStatus(dates(null, null), TODAY)).toBe("none");
  });

  it("is current from the start date with no end date", () => {
    expect(clientStatus(dates("2025-01-01", null), TODAY)).toBe("current");
    expect(clientStatus(dates(TODAY, null), TODAY)).toBe("current");
  });

  it("is upcoming before a future start date (signed, not started)", () => {
    expect(clientStatus(dates("2026-10-01", null), TODAY)).toBe("upcoming");
  });

  it("is still current on the end date and former the day after", () => {
    expect(clientStatus(dates("2026-08-13", TODAY), TODAY)).toBe("current");
    expect(clientStatus(dates("2026-08-13", "2026-09-14"), TODAY)).toBe("former");
  });
});
