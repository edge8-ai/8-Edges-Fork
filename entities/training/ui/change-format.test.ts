// TR.8: how change notes read on the page.
import { describe, expect, it } from "vitest";
import { dayLabel, feelingsLine, isNew, leaves } from "./change-format";
import type { Figures } from "../lib/programme-read-rules";

describe("change-format", () => {
  it("dates a note by its day in Vietnam, not the server's", () => {
    // 20:30 UTC on 29 Oct is already 30 Oct in Saigon.
    expect(dayLabel("2026-10-29T20:30:00Z")).toBe("30 Oct");
  });

  it("keeps a note new for a week after it is posted", () => {
    const now = new Date("2026-11-03T00:00:00Z");
    expect(isNew("2026-10-28T00:00:01Z", now)).toBe(true);
    expect(isNew("2026-10-27T00:00:00Z", now)).toBe(false);
  });

  it("grows a leaf per change, up to the sprout's room", () => {
    expect([0, 1, 3, 5, 9].map(leaves)).toEqual([0, 1, 3, 5, 5]);
  });

  it("gives no feelings while the read is hidden, and marks the hard ones", () => {
    expect(feelingsLine(null)).toBeNull();
    const f = { tags: [{ label: "Useful", n: 14 }, { label: "Too fast", n: 9 }] } as unknown as Figures;
    expect(feelingsLine(f)).toEqual([
      { label: "Useful", n: 14, friction: false },
      { label: "Too fast", n: 9, friction: true },
    ]);
  });
});
