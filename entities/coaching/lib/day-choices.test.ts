import { describe, expect, it } from "vitest";
import { dayChoices, dayInSentence, dayLabel, timeChoices, timeLabel } from "./day-choices";

describe("dayChoices", () => {
  it("offers the next working days, skipping the weekend", () => {
    // 2026-10-08 is a Thursday.
    expect(dayChoices("2026-10-08", null, 4)).toEqual(["2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13"]);
  });

  it("puts the day that keeps the rhythm first, once", () => {
    expect(dayChoices("2026-10-06", "2026-10-07", 3)).toEqual(["2026-10-07", "2026-10-06", "2026-10-08"]);
  });

  it("ignores a suggestion that has already passed", () => {
    expect(dayChoices("2026-10-06", "2026-10-01", 2)).toEqual(["2026-10-06", "2026-10-07"]);
  });
});

describe("timeChoices", () => {
  it("leads with the time the person said suits them", () => {
    expect(timeChoices("10:30")[0]).toBe("10:30");
  });

  it("does not offer the preferred time twice", () => {
    const times = timeChoices("10:00");
    expect(times.filter((t) => t === "10:00")).toHaveLength(1);
  });

  it("drops the leading zero only in the label", () => {
    expect(timeLabel("09:00")).toBe("9:00");
    expect(timeLabel("14:30")).toBe("14:30");
  });
});

describe("dayLabel", () => {
  it("says today and tomorrow as words, other days short", () => {
    expect(dayLabel("2026-10-06", "2026-10-06")).toBe("Today");
    expect(dayLabel("2026-10-07", "2026-10-06")).toBe("Tomorrow");
    expect(dayLabel("2026-10-05", "2026-10-06")).toBe("Yesterday");
    expect(dayLabel("2026-10-08", "2026-10-06")).toBe("Thu 8 Oct");
  });
});

describe("dayInSentence", () => {
  it("lowers the relative days only", () => {
    expect(dayInSentence("2026-10-07", "2026-10-07")).toBe("today");
    expect(dayInSentence("2026-10-05", "2026-10-07")).toBe("Mon 5 Oct");
  });
});
