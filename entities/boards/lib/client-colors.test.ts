import { describe, expect, it } from "vitest";
import { assignClientColors } from "./client-colors";
import { BADGE_PALETTE_SIZE } from "@/kernel/ui/Badge";

// What the client colours promise: every client in view looks different while
// there are no more clients than palette slots, and a client's colour does not
// depend on which surface asked or in what order the ids arrived.

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${String(i).padStart(2, "0")}`);

describe("assignClientColors", () => {
  it("gives every client its own slot while they fit the palette", () => {
    const colours = assignClientColors(ids(BADGE_PALETTE_SIZE));
    expect(new Set(colours.values()).size).toBe(BADGE_PALETTE_SIZE);
  });

  it("gives a client the same slot whatever order or duplicates the ids came in", () => {
    const a = assignClientColors(["c03", "c01", "c02"]);
    const b = assignClientColors(["c02", "c02", "c01", "c03"]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it("wraps once there are more clients than slots, staying in range", () => {
    const colours = assignClientColors(ids(BADGE_PALETTE_SIZE + 3));
    for (const slot of colours.values()) {
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(BADGE_PALETTE_SIZE);
    }
  });
});
