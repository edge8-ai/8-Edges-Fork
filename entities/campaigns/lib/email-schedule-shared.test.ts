import { describe, expect, it } from "vitest";
import { dayAndTime, projectSeriesSends } from "./email-schedule-shared";

// Draft Monday 08:00 Perth, send Wednesday 08:00 Perth (UTC+8, no DST).
const perth = {
  id: "s1",
  name: "Weekly note",
  brandName: "Edge8",
  timeZone: "Australia/Perth",
  draftWeekday: 1,
  draftHour: 8,
  sendWeekday: 3,
  sendHour: 8,
};

describe("projectSeriesSends", () => {
  it("projects one send per week from now, on the series' send moment", () => {
    // Sunday 2026-09-20 15:00 UTC.
    const items = projectSeriesSends(perth, new Set(), new Date("2026-09-20T15:00:00Z"), 3);
    expect(items.map((i) => i.at)).toEqual([
      "2026-09-23T00:00:00.000Z",
      "2026-09-30T00:00:00.000Z",
      "2026-10-07T00:00:00.000Z",
    ]);
    expect(items.every((i) => i.status === "projected")).toBe(true);
  });

  it("places the send on the company-time day and time", () => {
    const [item] = projectSeriesSends(perth, new Set(), new Date("2026-09-20T15:00:00Z"), 1);
    // 00:00 UTC is 07:00 in Ho Chi Minh City.
    expect(item.day).toBe("2026-09-23");
    expect(item.time).toBe("07:00");
  });

  it("marks a send unwritten once its draft moment has passed with no issue", () => {
    // Tuesday 2026-09-22 10:00 UTC: Monday's draft moment is behind us.
    const items = projectSeriesSends(perth, new Set(), new Date("2026-09-22T10:00:00Z"), 2);
    expect(items[0].status).toBe("unwritten");
    expect(items[1].status).toBe("projected");
  });

  it("leaves out a send whose issue already exists, so the issue's own chip shows instead", () => {
    const issues = new Set(["2026-09-23T00:00:00.000Z"]);
    const items = projectSeriesSends(perth, issues, new Date("2026-09-22T10:00:00Z"), 2);
    expect(items.map((i) => i.at)).toEqual(["2026-09-30T00:00:00.000Z"]);
  });
});

describe("dayAndTime", () => {
  it("reads the day boundary in company time", () => {
    // 18:30 UTC on the 21st is 01:30 on the 22nd in Ho Chi Minh City.
    expect(dayAndTime(new Date("2026-09-21T18:30:00Z"))).toEqual({ day: "2026-09-22", time: "01:30" });
  });
});
