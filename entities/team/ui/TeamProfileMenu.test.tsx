import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children as never}</a> }));
vi.mock("@/entities/team/lib/actions", () => ({ signOut: async () => {} }));

const { TeamProfileMenu } = await import("./TeamProfileMenu");

// LD.4: the reader's own face in the team sidebar wears the border they chose
// to show, so they see what teammates see. With nothing worn (or their game
// style off, which the layout's read already answers as nothing) the button is
// the one the sidebar always drew.
describe("TeamProfileMenu's face", () => {
  it("is the plain button the sidebar always drew when no border is worn", () => {
    const html = renderToStaticMarkup(<TeamProfileMenu name="Sam Rivera" avatarUrl={null} isAdmin={false} />);
    expect(html).toContain('<button type="button" class="admin-avatarbtn" aria-haspopup="menu" aria-expanded="false" aria-label="Switch view">SR</button>');
    expect(html).not.toContain("admin-face-frame");
  });

  it("wears the reader's border round the same initials", () => {
    const html = renderToStaticMarkup(<TeamProfileMenu name="Sam Rivera" avatarUrl={null} isAdmin={false} border="gold" />);
    expect(html).toContain('class="admin-avatarbtn admin-avatarbtn--framed"');
    expect(html).toContain('class="admin-face-frame frame-gold"');
    expect(html).toContain(">SR<");
    // The button keeps its name; the face inside it is decoration.
    expect(html).toContain('aria-label="Switch view"');
    expect(html).not.toContain('role="img"');
  });

  it("wears it round the reader's photo too", () => {
    const html = renderToStaticMarkup(<TeamProfileMenu name="Sam Rivera" avatarUrl="https://cdn.example/sam.jpg" isAdmin={false} border="silver" />);
    expect(html).toContain('<img class="admin-face-photo" src="https://cdn.example/sam.jpg" alt=""/>');
    expect(html).toContain("frame-silver");
  });
});
