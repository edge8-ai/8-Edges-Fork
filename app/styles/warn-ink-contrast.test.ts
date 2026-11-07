import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ID.2.10: the shared warn ink sits on the warn tint (every warn badge, the
// warn banner, the coaching "stuck" chips), on the amber tint (the coaching
// kanban's stuck count) and on white. It was 4.45:1 and 4.41:1 on the two tints,
// under the 4.5:1 minimum for 12px text, so this pins it above that on all three.
const tokens = readFileSync("app/styles/tokens.css", "utf8");

function hex(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!m) throw new Error(`${name} not found in tokens.css`);
  return m[1];
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("the warn ink", () => {
  it.each(["--color-warn-bg", "--color-amber-bg", "--color-bg-primary"])("reads at 4.5:1 or better on %s", (ground) => {
    expect(contrast(hex("--color-warn-ink"), hex(ground))).toBeGreaterThanOrEqual(4.5);
  });
});
