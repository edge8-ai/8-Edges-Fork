import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));

import { TeamMobileBar } from "./TeamMobileBar";

// TH.25. On a phone the team assistant opens from the top bar, because its
// floating button covered the page's own controls. The bar offers it only when
// the layout says an assistant is mounted: while an admin views as someone else
// there is none, and a button that opens nothing is worse than no button.
describe("TeamMobileBar", () => {
  it("offers the assistant when the layout mounts one", () => {
    const html = renderToStaticMarkup(<TeamMobileBar title="Home" onOpenNav={() => {}} assistant />);
    expect(html).toContain('aria-label="Open team assistant"');
  });

  it("offers no assistant without one, which is the default", () => {
    expect(renderToStaticMarkup(<TeamMobileBar title="Home" onOpenNav={() => {}} />)).not.toContain("Open team assistant");
    expect(renderToStaticMarkup(<TeamMobileBar title="Home" onOpenNav={() => {}} assistant={false} />)).not.toContain("Open team assistant");
  });

  it("keeps search beside it", () => {
    const html = renderToStaticMarkup(<TeamMobileBar title="Home" onOpenNav={() => {}} assistant />);
    expect(html).toContain('aria-label="Search"');
  });
});
