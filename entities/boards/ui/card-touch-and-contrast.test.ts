import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Bug hunt U6 and U9: touch targets and legibility on the card face, the
// drawer and the Deliverables section. These are stylesheet facts, so the
// test reads the stylesheet, as planning-lane-heading.test.ts does: a rule
// moved or dropped goes red here rather than on somebody's tablet.

const css = readFileSync("app/admin/admin.css", "utf8");
const tokens = readFileSync("app/styles/tokens.css", "utf8");

/** The bodies of every `@media (pointer: coarse)` block, braces matched. */
function coarseBlocks(): string {
  const out: string[] = [];
  let at = css.indexOf("@media (pointer: coarse)");
  while (at !== -1) {
    const open = css.indexOf("{", at);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push(css.slice(open + 1, i - 1));
    at = css.indexOf("@media (pointer: coarse)", i);
  }
  return out.join("\n");
}

/** The declarations of the rule whose selector list ends with `selector`. */
function ruleFor(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  return m?.[1] ?? "";
}

function hex(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(tokens);
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
}

function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("touch targets on a coarse pointer (bug hunt U6)", () => {
  const coarse = coarseBlocks();

  it("makes the add chips (field chips, Deliverables File and Link) 44px tall at any width", () => {
    expect(ruleFor(coarse, ".wb-add-chip")).toContain("min-height: 44px");
  });

  it("makes the drawer's Save, Archive and Copy link buttons 44px tall", () => {
    expect(ruleFor(coarse, ".wb-card-drawer .admin-form-actions .admin-btn")).toContain("min-height: 44px");
  });

  it("rings the face's quick date and PR chip to a 44px hit area without moving the line", () => {
    const ring = ruleFor(coarse, ".wb-chips > .wb-chip-link::before");
    expect(coarse).toMatch(/\.wb-face-meta \.wb-quick-due-text::before,\s*\.wb-face-meta \.wb-quick-setdate::before,\s*\.wb-chips > \.wb-chip-link::before/);
    expect(ring).toContain('content: ""');
    expect(ring).toContain("position: absolute");
    expect(ring).toContain("height: 44px");
    // The chip row and the chip clip sideways only, or the ring is cut back
    // to the row's 24px and the hit area with it.
    expect(ruleFor(coarse, ".wb-board .wb-chips")).toContain("overflow-y: visible");
    expect(ruleFor(coarse, ".wb-board .wb-chips > .wb-chip-link")).toContain("overflow-y: visible");
  });
});

describe("legibility (bug hunt U9)", () => {
  it("gives the face's warn chips an ink that clears 4.5:1 on the warn background", () => {
    const rule = ruleFor(css, ".wb-chips-rest > .admin-badge--warn");
    const token = /var\(--admin-([a-z-]+)\)/.exec(rule)?.[1];
    expect(token).toBe("amber-ink");
    expect(contrast(hex("--color-amber-ink"), hex("--color-warn-bg"))).toBeGreaterThanOrEqual(4.5);
    // The kernel badge itself is untouched: the scope is the card face.
    expect(ruleFor(css, ".admin-badge--warn")).toContain("color: var(--admin-warn-ink)");
  });

  it("sets the face's PR chip at 12px and the video length at 10px", () => {
    expect(ruleFor(css, ".wb-page .wb-chips > .wb-chip-link")).toContain("font-size: var(--admin-text-sm)");
    expect(tokens).toMatch(/--admin-text-sm:\s*12px/);
    expect(ruleFor(css, ".wb-deliv-tile-time")).toContain("font-size: 10px");
  });

  it("gives the Deliverables text buttons the house focus ring", () => {
    expect(ruleFor(css, ".wb-deliv-text-btn:focus-visible")).toContain("box-shadow: var(--admin-focus-ring)");
    expect(css).toMatch(/\.wb-deliv-open:focus-visible,\s*\.wb-deliv-text-btn:focus-visible/);
  });
});
