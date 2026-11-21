import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EPIC_COLORS, epicColor, epicColorIndex } from "./types";

// W.113.3. Slot 2 was near-black and is teal now. `epics.color` stores the
// token string, so the three live epics that saved the old one must keep
// their slot rather than falling back to brand blue.

describe("epic colours", () => {
  it("keeps an epic that saved the retired near-black in slot 2, painted teal", () => {
    expect(epicColor("var(--admin-chart-4)")).toBe("var(--color-client-5-ink)");
    expect(epicColorIndex("var(--admin-chart-4)")).toBe(2);
  });

  it("still reads current colours as themselves and anything unknown as blue", () => {
    for (const [i, c] of EPIC_COLORS.entries()) expect(epicColorIndex(c)).toBe(i);
    expect(epicColor(null)).toBe(EPIC_COLORS[0]);
    expect(epicColor("var(--admin-retired-token)")).toBe(EPIC_COLORS[0]);
  });

  it("paints every slot in admin.css with the token EPIC_COLORS names, in order", () => {
    // The dot, edge and swatch paint from [data-epic-color="n"], so a slot
    // whose CSS disagrees with its token is a swatch that saves one colour
    // and shows another.
    const css = readFileSync("app/admin/admin.css", "utf8");
    for (const [i, c] of EPIC_COLORS.entries()) {
      expect(css).toContain(`[data-epic-color="${i}"] { background: ${c}; }`);
    }
  });
});
