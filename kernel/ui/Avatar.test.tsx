import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Avatar, FRAME_AIR, FRAME_CLASS_PREFIX } from "./Avatar";

// LD.3: the shared face. Two things must stay true that the type checker cannot
// see. A face with no border is exactly the element its caller drew before
// (Quests and the board pass their own classes and nothing else changes), and a
// face with one draws the frame by key, after the face (so above it), with the
// face keeping its box.

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("Avatar · no border", () => {
  it("is one span with the caller's class, the name and the initials, and nothing else", () => {
    expect(html(<Avatar className="qs-av qs-av--md" name="Sam Rivera" initials="SR" />)).toBe('<span class="qs-av qs-av--md" title="Sam Rivera" aria-label="Sam Rivera" role="img">SR</span>');
  });

  it("treats null as no border", () => {
    expect(html(<Avatar className="qs-av" name="Sam" initials="S" border={null} />)).toBe('<span class="qs-av" title="Sam" aria-label="Sam" role="img">S</span>');
  });

  it("hides a decorative face from assistive technology and gives it no tooltip", () => {
    expect(html(<Avatar className="wb-face-avatar" name="Sam Rivera" initials="SR" decorative />)).toBe('<span class="wb-face-avatar" aria-hidden="true">SR</span>');
  });

  it("draws a photo in place of the initials", () => {
    const out = html(<Avatar name="Sam" initials="S" photoUrl="https://example.test/sam.jpg" size={40} />);
    expect(out).toContain('<img class="admin-face-photo" src="https://example.test/sam.jpg" alt=""/>');
    expect(out).not.toContain(">S<");
  });

  it("sizes itself only when given a size", () => {
    expect(html(<Avatar name="Sam" initials="S" size={64} />)).toContain('class="admin-face" style="--admin-face-size:64px"');
    expect(html(<Avatar className="qs-av" name="Sam" initials="S" />)).not.toContain("style=");
  });
});

describe("Avatar · with a border", () => {
  const out = html(<Avatar className="qs-av qs-av--lg" name="Sam" initials="S" border="gold" />);

  it("draws the frame as the key's class, under a prefix that names no entity", () => {
    expect(FRAME_CLASS_PREFIX).toBe("frame-");
    expect(out).toContain(`<span class="admin-face-frame ${FRAME_CLASS_PREFIX}gold" aria-hidden="true"></span>`);
  });

  it("keeps the face's own box and draws the frame after the face, so above it", () => {
    expect(out).toBe('<span class="qs-av qs-av--lg admin-face--framed" title="Sam" aria-label="Sam" role="img">S<span class="admin-face-frame frame-gold" aria-hidden="true"></span></span>');
  });

  it("keeps a hair of air between the face and the frame", () => {
    expect(FRAME_AIR).toBeGreaterThan(1);
    expect(FRAME_AIR).toBeLessThan(1.05);
  });
});
