import { describe, expect, it, vi } from "vitest";
import { analyzeCall, timeToSeconds } from "./call-analysis";

// The host is whoever call-host names; a fork names its own, so the test
// pins one rather than spelling out the upstream founder.
vi.mock("./call-host", () => ({ HOST_RE: /^host seller\b/i }));

// The host says twice as many words a second as the prospect. Both hold the floor
// for 60 seconds, so the talk ratio is half by time and two thirds by words.
const timed = [
  "Host Seller 00:00:00.000",
  "one two three four five six seven eight nine ten eleven twelve",
  "",
  "Pat Prospect 00:01:00.000",
  "one two three four five six",
  "",
  "Host Seller 00:02:00.000",
  "what takes your time every week?",
  "",
].join("\n");

describe("analyzeCall", () => {
  it("measures the talk ratio by speaking time, not words", () => {
    const stats = analyzeCall(timed);
    // The closing segment has no successor, so it is sized at the call's
    // average seconds per word: 120 s over 18 words, 6 words, 40 s.
    expect(stats.talkRatio).toBeCloseTo(100 / 160, 3);
    expect(stats.speakers.map((s) => [s.name, s.words, s.seconds])).toEqual([
      ["Host Seller", 18, 100],
      ["Pat Prospect", 6, 60],
    ]);
    expect(stats.questionCount).toBe(1);
  });

  it("falls back to word share when the transcript has no clock", () => {
    const untimed = timed.replace(/ \d\d:\d\d:\d\d\.\d{3}/g, " 00:00:00.000");
    // Every segment starts at zero, so each lasts zero seconds and time says nothing.
    expect(analyzeCall(untimed).talkRatio).toBeCloseTo(18 / 24, 3);
  });

  it("reads no host as no ratio", () => {
    expect(analyzeCall(timed.replace(/Host Seller/g, "Sam Seller")).talkRatio).toBeNull();
  });

  it("parses the clock shapes Lark and pasted transcripts use", () => {
    expect(timeToSeconds("1:02:03.5")).toBe(3723.5);
    expect(timeToSeconds("02:03")).toBe(123);
    expect(timeToSeconds("x")).toBeNull();
    expect(timeToSeconds(null)).toBeNull();
  });
});
