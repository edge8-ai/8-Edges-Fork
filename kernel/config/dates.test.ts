import { describe, expect, it } from "vitest";
import { addDays, diffDays, isWeekend, nextWorkday, previousWorkday, saigonToday } from "./dates";

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-09-02", 5)).toBe("2026-09-07");
  });
  it("crosses a month boundary", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("crosses a year boundary and handles leap days", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("diffDays", () => {
  it("counts whole days in either direction", () => {
    expect(diffDays("2026-01-31", "2026-02-02")).toBe(2);
    expect(diffDays("2026-02-02", "2026-01-31")).toBe(-2);
  });
});

describe("saigonToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(saigonToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("the working week", () => {
  // 2026-09-19 is a Saturday, 2026-09-20 the Sunday after it.
  it("names the two days nobody works", () => {
    expect(isWeekend("2026-09-19")).toBe(true);
    expect(isWeekend("2026-09-20")).toBe(true);
    expect(isWeekend("2026-09-18")).toBe(false);
    expect(isWeekend("2026-09-21")).toBe(false);
  });
  it("offers the Friday before and the Monday after", () => {
    expect(previousWorkday("2026-09-19")).toBe("2026-09-18");
    expect(nextWorkday("2026-09-19")).toBe("2026-09-21");
    expect(previousWorkday("2026-09-20")).toBe("2026-09-18");
    expect(nextWorkday("2026-09-20")).toBe("2026-09-21");
  });
  it("leaves a weekday alone, so a caller can apply them blind", () => {
    expect(previousWorkday("2026-09-16")).toBe("2026-09-16");
    expect(nextWorkday("2026-09-16")).toBe("2026-09-16");
  });
  it("crosses a month boundary both ways", () => {
    // 2026-08-01 is a Saturday; its Friday is in July.
    expect(previousWorkday("2026-08-01")).toBe("2026-07-31");
    // 2026-10-31 is a Saturday; its Monday is in November.
    expect(nextWorkday("2026-10-31")).toBe("2026-11-02");
  });
});
