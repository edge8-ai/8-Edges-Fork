import { beforeEach, describe, expect, it, vi } from "vitest";

const { result } = vi.hoisted(() => ({ result: { data: null as unknown, error: null as { message: string } | null } }));

vi.mock("@/kernel/data/supabase", () => {
  const query = { select: () => query, gte: () => query, lte: () => query, order: () => Promise.resolve(result) };
  return { companyOs: { from: () => query } };
});

import { holidayCalendar, listHolidayDates } from "./holidays";

// The two reads answer a failure differently, on purpose. The forgiving one keeps a
// leave screen up. The other decides a deadline, where empty would be a wrong answer.
describe("when the holidays read fails", () => {
  beforeEach(() => {
    result.data = null;
    result.error = { message: "boom" };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("holidayCalendar raises rather than answering with no holidays", async () => {
    await expect(holidayCalendar("2026-01-01", "2026-12-31")).rejects.toThrow("boom");
  });

  it("listHolidayDates still answers empty, for the screens that accept it", async () => {
    await expect(listHolidayDates("2026-01-01", "2026-12-31")).resolves.toEqual([]);
  });
});

describe("holidayCalendar", () => {
  it("answers each day with its name", async () => {
    result.error = null;
    result.data = [{ date: "2026-11-24", name: "Vietnam Culture Day" }];
    await expect(holidayCalendar("2026-11-01", "2026-11-30")).resolves.toEqual([{ date: "2026-11-24", name: "Vietnam Culture Day" }]);
  });
});
