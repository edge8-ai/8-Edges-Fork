import { describe, expect, it } from "vitest";
import { decideWrite, learningsOf, matchLiveEvent, zoomMeetingIdOf, type PlatformCoachingEvent } from "./key-learnings-match";

// The rules the key-learnings pass applies (ADR 0017), on the shapes the
// platform actually held on 15 October 2026: a real session with a cancelled
// twin on the same Thursday, and an 8 October session scheduled 51 minutes
// before its recording started.

const JOIN = "https://us06web.zoom.us/j/81941198605?pwd=ekRG5NK5IFZwRpl3rIk5AVTGWbII";

const event = (over: Partial<PlatformCoachingEvent> & { id: string }): PlatformCoachingEvent => ({
  title: "Live group coaching",
  scheduled_at: "2026-10-08T04:00:00+00:00",
  status: "completed",
  meeting_url: JOIN,
  key_learnings: null,
  ...over,
});

const recording = { zoomMeetingId: "81941198605", startedAt: "2026-10-08T04:02:21+00:00" };

describe("zoomMeetingIdOf", () => {
  it("reads the id out of a join link, with or without a passcode", () => {
    expect(zoomMeetingIdOf(JOIN)).toBe("81941198605");
    expect(zoomMeetingIdOf("https://us06web.zoom.us/j/81941198605")).toBe("81941198605");
  });

  it("is null for no link or a link with no id", () => {
    expect(zoomMeetingIdOf(null)).toBeNull();
    expect(zoomMeetingIdOf("https://meet.google.com/abc-defg-hij")).toBeNull();
  });
});

describe("matchLiveEvent", () => {
  it("skips the cancelled twin and takes the real session, even 51 minutes early", () => {
    const events = [
      event({ id: "real", scheduled_at: "2026-10-08T03:11:00+00:00" }),
      event({ id: "twin", status: "cancelled" }),
    ];
    expect(matchLiveEvent(recording, events)).toEqual({ kind: "match", event: events[0] });
  });

  it("takes the nearest when the window holds only one live candidate per meeting id", () => {
    const events = [
      event({ id: "other-meeting", meeting_url: "https://us06web.zoom.us/j/99999999999" }),
      event({ id: "last-week", scheduled_at: "2026-10-01T04:00:00+00:00" }),
      event({ id: "this-week" }),
    ];
    expect(matchLiveEvent(recording, events)).toMatchObject({ kind: "match", event: { id: "this-week" } });
  });

  it("is none when nothing is inside three hours, has the id, or is not cancelled", () => {
    expect(matchLiveEvent(recording, [event({ id: "next-week", scheduled_at: "2026-10-15T04:00:00+00:00" })])).toEqual({ kind: "none" });
    expect(matchLiveEvent(recording, [event({ id: "elsewhere", meeting_url: null })])).toEqual({ kind: "none" });
    expect(matchLiveEvent(recording, [event({ id: "called-off", status: "cancelled" })])).toEqual({ kind: "none" });
    expect(matchLiveEvent({ zoomMeetingId: null, startedAt: recording.startedAt }, [event({ id: "x" })])).toEqual({ kind: "none" });
  });

  it("refuses two live candidates inside the window rather than guessing", () => {
    const events = [event({ id: "b" }), event({ id: "a", scheduled_at: "2026-10-08T05:00:00+00:00" })];
    expect(matchLiveEvent(recording, events)).toEqual({ kind: "ambiguous", candidates: ["b", "a"] });
  });
});

describe("learningsOf", () => {
  it("keeps the non-empty strings and nothing else", () => {
    expect(learningsOf(["Ship small", "  ", 3, null, " Plan first "])).toEqual(["Ship small", "Plan first"]);
    expect(learningsOf(null)).toEqual([]);
    expect(learningsOf("not a list")).toEqual([]);
  });
});

describe("decideWrite", () => {
  it("writes an empty session", () => {
    expect(decideWrite(null)).toBe("write");
    expect(decideWrite([])).toBe("write");
    expect(decideWrite(["", " "])).toBe("write");
  });

  it("keeps any list that is there, which is a person's", () => {
    expect(decideWrite(["Focus on Planning - 5Ds framework taught in A01"])).toBe("keep");
  });
});
