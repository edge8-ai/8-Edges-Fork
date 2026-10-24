import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CardDrawerBottomBar } from "./CardDrawerBottomBar";

// W.183: on a phone the comment box and the card's actions have to be on
// screen without scrolling. The bar draws a slot the comment box is portalled
// into, and a ⋯ button whose menu holds the actions; closed until tapped.
describe("CardDrawerBottomBar", () => {
  const render = () =>
    renderToStaticMarkup(
      <CardDrawerBottomBar shareUrl="/team/boards/demo?card=c1" boardHref={null} saving={false} onArchive={() => {}} composerHost={() => {}} />,
    );

  it("draws the comment box's slot before the ⋯ button", () => {
    const html = render();
    const slot = html.indexOf('class="wb-drawer-bottombar-composer"');
    const more = html.indexOf('aria-label="More actions"');
    expect(slot).toBeGreaterThan(-1);
    expect(more).toBeGreaterThan(slot);
  });

  it("keeps its menu closed until the button is pressed, and says so", () => {
    const html = render();
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain("Archive card");
  });
});
