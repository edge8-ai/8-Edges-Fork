import { describe, expect, it } from "vitest";
import { clientTone, matchesShow, metPhrase, readShow, waitingHeadline } from "./my-clients-view";

const list = (total: number) => ({ shown: [], more: [], total });
const facts = (now: number, waiting: number, moved: number) => ({
  now: list(now),
  waiting: list(waiting),
  moved: list(moved),
  quiet: now === 0 && waiting === 0 && moved === 0,
});

describe("readShow", () => {
  it("reads every status the strip offers", () => {
    expect(["waiting", "now", "shipped", "quiet"].map((s) => readShow(s))).toEqual(["waiting", "now", "shipped", "quiet"]);
  });
  it("shows every client for a missing or unknown value", () => {
    expect(readShow(undefined)).toBeNull();
    expect(readShow("moved")).toBeNull();
  });
});

describe("matchesShow", () => {
  it("puts a client under each status it has", () => {
    const d = facts(2, 1, 0);
    expect(matchesShow(d, null)).toBe(true);
    expect(matchesShow(d, "waiting")).toBe(true);
    expect(matchesShow(d, "now")).toBe(true);
    expect(matchesShow(d, "shipped")).toBe(false);
    expect(matchesShow(d, "quiet")).toBe(false);
  });
  it("a quiet client is under Quiet and nothing else", () => {
    const d = facts(0, 0, 0);
    expect(matchesShow(d, "quiet")).toBe(true);
    expect(matchesShow(d, "waiting") || matchesShow(d, "now") || matchesShow(d, "shipped")).toBe(false);
  });
});

describe("waitingHeadline", () => {
  it("names one, two or three clients", () => {
    expect(waitingHeadline(["Northwind"])).toBe("You’re waiting on Northwind.");
    expect(waitingHeadline(["Northwind", "Contoso"])).toBe("You’re waiting on Northwind and Contoso.");
    expect(waitingHeadline(["A", "B", "C"])).toBe("You’re waiting on A, B and C.");
  });
  it("counts past three, and says when nothing waits", () => {
    expect(waitingHeadline(["A", "B", "C", "D"])).toBe("You’re waiting on 4 clients.");
    expect(waitingHeadline([])).toBe("Nothing is waiting on a client.");
  });
});

describe("metPhrase", () => {
  it("counts days from the meeting to today", () => {
    expect(metPhrase("2026-10-07", "2026-10-07")).toEqual({ text: "Met today", stale: false });
    expect(metPhrase("2026-10-06", "2026-10-07")).toEqual({ text: "Met yesterday", stale: false });
    expect(metPhrase("2026-09-23", "2026-10-07")).toEqual({ text: "Met 14 days ago", stale: false });
  });
  it("turns stale past two weeks", () => {
    expect(metPhrase("2026-09-16", "2026-10-07")).toEqual({ text: "Met 21 days ago", stale: true });
  });
  it("says so when there has never been a meeting", () => {
    expect(metPhrase(null, "2026-10-07")).toEqual({ text: "No meetings yet", stale: false });
  });
});

describe("clientTone", () => {
  it("is stable for an id and never amber", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    for (const id of ids) {
      expect(clientTone(id)).toBe(clientTone(id));
      expect(clientTone(id)).not.toBe(2);
      expect(clientTone(id)).toBeGreaterThanOrEqual(0);
      expect(clientTone(id)).toBeLessThanOrEqual(11);
    }
  });
});
