import { describe, expect, it } from "vitest";
import { addWorkingDays, reminderOn, settleByOf, workingDaysLeft, type HolidayDay } from "./working-days";

const CULTURE_DAY: HolidayDay = { date: "2026-11-24", name: "Vietnam Culture Day" };
const TET_2026: HolidayDay = { date: "2026-02-16", name: "Tết Nguyên Đán" };
const TET_2027: HolidayDay[] = ["2027-02-04", "2027-02-05", "2027-02-08", "2027-02-09", "2027-02-10"].map((date) => ({ date, name: "Tết Nguyên Đán" }));
const CALENDAR = [TET_2026, CULTURE_DAY, ...TET_2027];

describe("addWorkingDays", () => {
  it("never counts the day it starts from", () => {
    expect(addWorkingDays("2026-11-02", 1, [])).toBe("2026-11-03");
  });

  it("skips a weekend, from a Friday and from a weekend day", () => {
    expect(addWorkingDays("2026-11-06", 1, [])).toBe("2026-11-09");
    expect(addWorkingDays("2026-11-07", 1, [])).toBe("2026-11-09");
  });

  it("skips a holiday", () => {
    expect(addWorkingDays("2026-11-23", 1, [CULTURE_DAY])).toBe("2026-11-25");
  });

  it("counts back for a negative count", () => {
    expect(addWorkingDays("2026-11-25", -1, [CULTURE_DAY])).toBe("2026-11-23");
    expect(addWorkingDays("2026-11-09", -1, [])).toBe("2026-11-06");
  });

  it("stays put for zero", () => {
    expect(addWorkingDays("2026-11-07", 0, [])).toBe("2026-11-07");
  });

  it("crosses Tết and its weekend", () => {
    expect(addWorkingDays("2027-02-03", 10, TET_2027)).toBe("2027-02-24");
  });
});

describe("workingDaysLeft", () => {
  it("counts the prototype's own example", () => {
    expect(workingDaysLeft("2026-11-04", "2026-11-30", [CULTURE_DAY])).toBe(17);
  });

  it("counts the deadline itself, and nothing once it has passed", () => {
    expect(workingDaysLeft("2026-11-27", "2026-11-30", [])).toBe(1);
    expect(workingDaysLeft("2026-11-30", "2026-11-30", [])).toBe(0);
    expect(workingDaysLeft("2026-12-01", "2026-11-30", [])).toBe(0);
  });
});

describe("reminderOn", () => {
  it("goes three working days before the deadline", () => {
    expect(reminderOn("2026-11-30", [CULTURE_DAY])).toBe("2026-11-25");
  });

  it("skips a holiday on the way back", () => {
    expect(reminderOn("2026-11-26", [CULTURE_DAY])).toBe("2026-11-20");
  });
});

describe("settleByOf", () => {
  it("counts ten working days from the spend, skipping a holiday", () => {
    expect(settleByOf({ spendEndsOn: "2026-11-13", paidOutOn: "2026-11-04" }, CALENDAR)).toEqual({ ok: true, settleBy: "2026-11-30" });
  });

  it("counts from a payout later than the spend, so a slow transfer costs the person nothing", () => {
    expect(settleByOf({ spendEndsOn: "2026-11-04", paidOutOn: "2026-11-13" }, CALENDAR)).toEqual({ ok: true, settleBy: "2026-11-30" });
  });

  it("counts across Tết when the year is in the calendar", () => {
    expect(settleByOf({ spendEndsOn: "2027-02-03", paidOutOn: "2027-02-01" }, CALENDAR)).toEqual({ ok: true, settleBy: "2027-02-24" });
  });

  it("refuses when the count reaches a year with no Tết in the calendar", () => {
    const result = settleByOf({ spendEndsOn: "2026-12-28", paidOutOn: "2026-12-20" }, [TET_2026, CULTURE_DAY]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("2027");
  });

  it("refuses when the year it starts in has no Tết, even if the deadline falls inside it", () => {
    expect(settleByOf({ spendEndsOn: "2027-03-01", paidOutOn: "2027-03-01" }, [TET_2026]).ok).toBe(false);
  });

  it("refuses an empty calendar rather than counting weekends alone", () => {
    expect(settleByOf({ spendEndsOn: "2026-11-13", paidOutOn: "2026-11-04" }, []).ok).toBe(false);
  });

  it("reads Tết with or without its accent, since the name is typed by a person", () => {
    expect(settleByOf({ spendEndsOn: "2026-11-13", paidOutOn: "2026-11-04" }, [{ date: "2026-02-16", name: "Tet Holiday" }]).ok).toBe(true);
  });
});
