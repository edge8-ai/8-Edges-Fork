import { describe, expect, it } from "vitest";
import { sinceLine, type SinceFacts } from "./since-line";

// 2026-09-15 is a Tuesday and 2026-09-17 a Thursday, which is what makes the
// weekday wording in these cases readable at a glance.
const base: SinceFacts = { lastHeldOn: "2026-09-15", kept: 0, notes: 0, goal: null, cards: 0 };

describe("sinceLine", () => {
  it("offers the board when nothing has happened", () => {
    const line = sinceLine(base, "2026-09-17");
    expect(line.empty).toBe(true);
    expect(line.body).toBe("Nothing yet since Tuesday — the board is right here.");
  });

  it("writes one fact as one clause", () => {
    const line = sinceLine({ ...base, kept: 1 }, "2026-09-17");
    expect(line.empty).toBe(false);
    expect(line.lead).toBe("Since Tuesday");
    expect(line.body).toBe("You kept 1 thing you promised.");
  });

  it("joins two facts with and", () => {
    const line = sinceLine({ ...base, kept: 2, notes: 1 }, "2026-09-17");
    expect(line.body).toBe("You kept 2 things you promised and wrote 1 note.");
  });

  it("joins many facts with the serial comma, in the order the story happened", () => {
    const line = sinceLine(
      { ...base, kept: 2, cards: 3, notes: 1, goal: { before: 100, after: 119, unit: "students" } },
      "2026-09-17",
    );
    expect(line.body).toBe(
      "You kept 2 things you promised, finished 3 cards on your board, moved your goal from 100 to 119 students, and wrote 1 note.",
    );
  });

  it("names the goal bump without a unit when the goal has none", () => {
    const line = sinceLine({ ...base, goal: { before: 4, after: 6, unit: null } }, "2026-09-17");
    expect(line.body).toBe("You moved your goal from 4 to 6.");
  });

  it("says nothing about a goal that was re-saved at the same number", () => {
    const line = sinceLine({ ...base, goal: { before: 10, after: 10, unit: "students" } }, "2026-09-17");
    expect(line.empty).toBe(true);
  });

  it("uses the weekday up to six days out", () => {
    expect(sinceLine({ ...base, kept: 1 }, "2026-09-21").lead).toBe("Since Tuesday");
  });

  it("uses the date once the weekday would name the wrong week", () => {
    expect(sinceLine({ ...base, kept: 1 }, "2026-09-22").lead).toBe("Since 15 Sep");
    expect(sinceLine({ ...base, lastHeldOn: "2026-09-03", kept: 1 }, "2026-09-17").lead).toBe("Since 3 Sep");
  });

  it("uses the date for a meeting dated ahead of today", () => {
    expect(sinceLine({ ...base, lastHeldOn: "2026-09-18", kept: 1 }, "2026-09-17").lead).toBe("Since 18 Sep");
  });

  it("says today's weekday when the 1-1 was held today", () => {
    expect(sinceLine({ ...base, kept: 1 }, "2026-09-15").lead).toBe("Since Tuesday");
  });
});
