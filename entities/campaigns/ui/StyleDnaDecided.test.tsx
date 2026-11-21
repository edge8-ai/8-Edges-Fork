import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/revenue/marketing/calendar" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

import { StyleDnaDecided } from "./StyleDnaDecided";

// R3.343.3: the note above a post's image brief shows the brand's Style DNA,
// the Fixed decisions and the entry's own channel and nothing from another
// channel. Since R3.350 no picture is made from Style DNA (the hero and the
// sets take the brand kit's colours, type and logo), so the note says what
// does read it, the writer drafting a brief, and never that the picture does.

const dna = `<!-- style-dna: draft -->
## Fixed
- Palette: Navy ground, Blue accent.
- People: Line-art only.

## LinkedIn
- Composition: One idea in the middle third.

## Facebook
- Energy: Warm and human.
- Camera angle: Slightly above.

## X
- Energy: Punchy.`;

const ready = (styleDnaMd: string | null) => ({ status: "ready" as const, styleDnaMd, brandSlug: "edge8" });
const render = (channel: string, md: string | null = dna) => renderToStaticMarkup(<StyleDnaDecided load={ready(md)} channel={channel} />);

describe("StyleDnaDecided", () => {
  it("shows the Fixed decisions and the entry's channel, and no other channel", () => {
    const html = render("facebook");
    expect(html).toContain("Style DNA the writer drafts from");
    expect(html).not.toContain("Already decided");
    expect(html).toContain(">Palette: Navy ground, Blue accent.<");
    expect(html).toContain(">People: Line-art only.<");
    expect(html).toContain(">Facebook<");
    expect(html).toContain(">Energy: Warm and human.<");
    expect(html).toContain(">Camera angle: Slightly above.<");
    expect(html).not.toContain("One idea in the middle third");
    expect(html).not.toContain("Punchy");
    expect(html).not.toContain("style-dna: draft");
  });

  it("heads the twitter channel's decisions as X", () => {
    const html = render("twitter");
    expect(html).toContain(">X<");
    expect(html).toContain(">Energy: Punchy.<");
    expect(html).not.toContain("Warm and human");
  });

  it("shows only the Fixed decisions for a channel with no section of its own", () => {
    const html = render("email");
    expect(html).toContain(">Palette: Navy ground, Blue accent.<");
    expect(html).not.toContain("Warm and human");
    expect(html).not.toContain("Punchy");
    expect(html).not.toContain("One idea in the middle third");
  });

  it("shows free text from before Style DNA as it is", () => {
    const html = render("facebook", "Navy ground, editorial, never stock.");
    expect(html).toContain("Navy ground, editorial, never stock.");
    expect(html).not.toContain("admin-chip");
  });

  it("links to the brand's Visuals tab", () => {
    expect(render("facebook")).toContain('href="/admin/revenue/marketing/brands/edge8?tab=visuals"');
  });

  it("says a failed read failed rather than that nothing is decided", () => {
    const html = renderToStaticMarkup(<StyleDnaDecided load={{ status: "error", error: "connection reset" }} channel="facebook" />);
    expect(html).toContain("connection reset");
    expect(html).not.toContain("Nothing yet.");
  });
});
