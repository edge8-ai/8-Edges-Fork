import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAME_AIR } from "@/kernel/ui/Avatar";
import { Border, borderBox, Emblem } from "./Emblem";

// LD.3: a call site names a tier and the module draws its art. These hold with
// whichever module is installed (Edge8's art, or the fork's plain set), since
// both draw to the boxes in emblem-contract.ts.

describe("Emblem", () => {
  it("draws a Learn & Share helm at the art's proportions, named by its tier", () => {
    const out = renderToStaticMarkup(<Emblem ladder="learn_share" tier="gold" size={112} />);
    expect(out).toContain('<span class="ladder-emblem" role="img" aria-label="Gold">');
    expect(out).toContain('width="112" height="128"');
  });

  it("draws a Builder medal, with the owner's star arc only when it is given", () => {
    const withStars = renderToStaticMarkup(<Emblem ladder="builder" tier="legend" stars={3} size={64} />);
    expect(withStars).toContain('class="ladder-emblem-stars"');
    expect(renderToStaticMarkup(<Emblem ladder="builder" tier="legend" size={64} />)).not.toContain("ladder-emblem-stars");
  });

  it("never draws a star on Immortal, and draws each of its bands differently", () => {
    const bands = ([1, 2, 3] as const).map((band) => renderToStaticMarkup(<Emblem ladder="builder" tier="immortal" band={band} stars={5} size={64} />));
    for (const out of bands) expect(out).not.toContain("ladder-emblem-stars");
    expect(new Set(bands).size).toBe(3);
  });
});

describe("Border", () => {
  it.each([112, 64, 32, 22])("clears a %ipx face by the Avatar's air, with the face inside its box", (size) => {
    const box = borderBox("gold", size);
    const [, , vbWidth] = box.viewBox.split(" ").map(Number);
    const pxPerUnit = box.width / vbWidth;
    // The hole is 100 units; at this scale it is the face's radius times the air.
    expect(100 * pxPerUnit).toBeCloseTo((size / 2) * FRAME_AIR, 1);
    expect(box.faceX - size / 2).toBeGreaterThanOrEqual(0);
    expect(box.faceY - size / 2).toBeGreaterThanOrEqual(0);
    expect(box.faceX + size / 2).toBeLessThanOrEqual(box.width);
    expect(box.faceY + size / 2).toBeLessThanOrEqual(box.height);
  });

  it("draws the face first and the frame above it, at the frame's full extent", () => {
    const box = borderBox("gold", 64);
    const out = renderToStaticMarkup(
      <Border tier="gold" size={64}>
        <span className="face" />
      </Border>,
    );
    expect(out.indexOf('class="face"')).toBeLessThan(out.indexOf('class="ladder-border-frame"'));
    expect(out).toContain(`width="${box.width}" height="${box.height}"`);
  });
});
