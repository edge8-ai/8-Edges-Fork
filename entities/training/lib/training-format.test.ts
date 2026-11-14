import { describe, expect, it } from "vitest";
import { closesLabel, finalOnLabel, formParts, lengthLabel, trainingMeta, typeTone, whenLabel, wordView } from "./training-format";
import { saigonRange, type MyTrainingRow } from "./training-rules";

describe("how a training's time reads (TR.2)", () => {
  it("says the day, the Vietnam start time and the length", () => {
    expect(whenLabel("2026-10-09T09:00:00.000Z", "2026-10-09T10:00:00.000Z")).toBe("Fri 9 Oct · 16:00 · 1 h");
    expect(whenLabel("2026-10-10T13:00:00.000Z", "2026-10-10T14:30:00.000Z")).toBe("Sat 10 Oct · 20:00 · 1.5 h");
  });

  it("says short lengths in minutes", () => {
    expect(lengthLabel(45)).toBe("45 min");
    expect(lengthLabel(120)).toBe("2 h");
  });

  it("gives a form back the date, start and length it was saved from", () => {
    const { startsAt, endsAt } = saigonRange("2026-10-14", "14:00", 120);
    expect(formParts(startsAt, endsAt)).toEqual({ date: "2026-10-14", start: "14:00", minutes: 120 });
    const late = saigonRange("2026-10-14", "23:30", 60);
    expect(formParts(late.startsAt, late.endsAt)).toEqual({ date: "2026-10-14", start: "23:30", minutes: 60 });
  });

  it("cycles six type colours", () => {
    expect(typeTone(0)).toBe("tr-type-0");
    expect(typeTone(7)).toBe("tr-type-1");
  });

  it("names who put a training on the record", () => {
    expect(trainingMeta({ typeName: "Workshop", selfLogged: false, organiserName: "Alex Example" })).toBe("Workshop · by Alex Example");
    expect(trainingMeta({ typeName: "Online course", selfLogged: true, organiserName: null })).toBe("Online course · logged by you");
  });
});

describe("how the seven-day window reads (TR.3)", () => {
  const ends = "2026-10-09T10:00:00Z"; // final at 2026-10-16T10:00Z, 17:00 in Vietnam

  it("counts whole days left, and says so on the last one", () => {
    expect(closesLabel(ends, new Date("2026-10-11T10:00:00Z"))).toBe("Open 5 more days");
    expect(closesLabel(ends, new Date("2026-10-15T09:00:00Z"))).toBe("Open 1 more day");
    expect(closesLabel(ends, new Date("2026-10-16T02:00:00Z"))).toBe("Open until 17:00");
  });

  it("names the day and the time the answer becomes final, in Vietnam", () => {
    expect(finalOnLabel(ends)).toBe("Fri 16 Oct, 17:00");
  });
});

describe("what one row of the tray or the log shows (TR.3)", () => {
  const base: MyTrainingRow = {
    attendanceId: "a1",
    trainingId: "t1",
    title: "Sharing session: Claude Code subagents",
    typeId: "ty1",
    typeName: "Sharing session",
    typeRank: 3,
  source: "member",
    organiserName: "An organiser",
    startsAt: "2026-10-09T09:00:00Z",
    endsAt: "2026-10-09T10:00:00Z",
    selfLogged: false,
    status: "attended",
    skipReason: null,
    answeredAt: "2026-10-09T11:00:00Z",
    review: { stars: 4, load: "about_right", tags: ["useful"], note: null, signed: false },
    loggedAt: "2026-10-08T00:00:00Z",
  };

  it("carries the review, the window and the answer line", () => {
    expect(wordView(base, new Date("2026-10-11T10:00:00Z"))).toEqual({
      attendanceId: "a1",
      trainingId: "t1",
      title: "Sharing session: Claude Code subagents",
      when: "Fri 9 Oct · 16:00 · 1 h",
      meta: "Sharing session · by An organiser",
      tone: "tr-type-3",
      status: "attended",
      skipReason: null,
      review: base.review,
      open: true,
      closes: "Open 5 more days",
      finalOn: "Fri 16 Oct, 17:00",
      line: "4 stars · about right",
    });
  });

  it("is closed once the window has passed", () => {
    expect(wordView(base, new Date("2026-10-17T00:00:00Z")).open).toBe(false);
  });

  it("counts a training the member logged late from when they logged it", () => {
    const late = { ...base, selfLogged: true, loggedAt: "2026-10-12T03:00:00Z" };
    const view = wordView(late, new Date("2026-10-17T00:00:00Z"));
    expect(view).toMatchObject({ open: true, finalOn: "Mon 19 Oct, 10:00" });
  });
});
