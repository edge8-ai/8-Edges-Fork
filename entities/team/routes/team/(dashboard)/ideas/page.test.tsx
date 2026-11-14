import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceViewer } from "@/kernel/shell/faces";
import type { SharedIdea } from "@/entities/team/lib/data";

// Spark's worn borders (LD.8; spec "Faces and borders"). The page asks the
// kernel's faces seam once per render, for the reader, for every spark's
// author, and each author's face on the deck and in the field wears their tier
// and nothing else about them: no division, no star, no point. Invented people:
// the public fork receives tests too.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => "/team/ideas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ roles: [], may: () => true }) }));
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: "me", isAdmin: false }) }));

const asks: { ids: readonly string[]; viewer: FaceViewer }[] = [];
let wearing = new Map<string, string>();
vi.mock("@/kernel/shell/faces", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/shell/faces")>()),
  wornTiersFor: async (ids: readonly string[], viewer: FaceViewer) => {
    asks.push({ ids, viewer });
    return new Map([...wearing].filter(([id]) => ids.includes(id)));
  },
}));

const spark = (id: string, personId: string, submitterName: string, title: string): SharedIdea => ({
  id, kind: "idea", person_id: personId, title, problem: null, data_needed: null, workflow: null, roi: null, story: null, takeaway: null,
  source_urls: null, office: null, ai_plan: null, ai_error: null, status: "submitted", created_at: "2026-10-20T03:00:00.000Z", submitterName,
});
// Two sparks by the wearer, one by a teammate who wears nothing, one by a
// teammate who wears only a Builder medal, and one by the reader.
const SPARKS = [
  spark("s1", "wearer", "Kim Wearer", "Batch the kettle orders"),
  spark("s2", "wearer", "Kim Wearer", "Label the tea shelf"),
  spark("s3", "plain", "Pat Plain", "Fix the office door"),
  spark("s4", "builder", "Bo Builder", "Share the printer queue"),
  spark("s5", "me", "Me Reader", "Water the plants on Fridays"),
];
vi.mock("@/entities/team/lib/data", () => ({ getSharedIdeas: async () => SPARKS, getSharedIdea: async () => null }));
vi.mock("@/entities/team/lib/spark-reads", () => ({ ownWithdrawnSparks: async () => [] }));
vi.mock("@/entities/boards", () => ({ cardsForIdeas: async () => [] }));
vi.mock("@/entities/ideas", async (importActual) => ({
  ...(await importActual<typeof import("@/entities/ideas")>()),
  readSparkSignals: async () => ({ reactions: [], builds: [] }),
  latestThemeReport: async () => null,
}));

const { default: IdeasPage } = await import("./page");
const render = async () => renderToStaticMarkup(await IdeasPage({ searchParams: Promise.resolve({}), badgeDrops: null }));

beforeEach(() => {
  asks.length = 0;
  // The seam answers the border each person wears: Bo wears only a Builder
  // medal, which never sits beside a face, so ladders leaves him out.
  wearing = new Map([["wearer", "gold"]]);
});

describe("Spark's worn borders", () => {
  it("asks the faces seam once per render, for the reader, with every spark's author", async () => {
    await render();
    expect(asks).toHaveLength(1);
    expect(asks[0].viewer).toEqual({ personId: "me" });
    expect([...new Set(asks[0].ids)].sort()).toEqual(["builder", "me", "plain", "wearer"]);
    await render();
    expect(asks).toHaveLength(2);
  });

  it("puts the Gold border on the wearer's face on the deck and on each of their sparks in the field, and on nobody else's", async () => {
    const html = await render();
    // The deck opens on one of the wearer's sparks (fewest answers first, a
    // different teammate each time), and the field draws both of theirs.
    const deckAt = html.indexOf('id="deck-h"');
    const deck = html.slice(deckAt, html.indexOf("</section>", deckAt));
    expect(deck).toMatch(/admin-face-frame frame-gold"[^>]*><\/span><\/span><span>Kim Wearer<\/span>/);
    const field = html.slice(html.indexOf("sparks-tile"));
    expect(field.match(/admin-face-frame frame-gold/g)).toHaveLength(2);
    expect(html).not.toMatch(/frame-(?!gold)[a-z]+/);
  });

  it("says the tier alone: no division, no star, no point, and no Builder tier", async () => {
    const html = await render();
    expect(html).not.toMatch(/division|★|\bpoints?\b|\bGold\b|[Ll]egend|[Aa]rchon|\bIV\b|\bIII\b/);
  });

  it("draws the faces Spark always drew when the seam answers nothing, as it does for a viewer whose game style is off", async () => {
    wearing = new Map();
    const html = await render();
    expect(html).not.toContain("admin-face-frame");
    expect(html).not.toContain("admin-face--framed");
    // The author's face is still the element Spark drew before LD.8.
    expect(html).toContain('<span class="sparks-avatar sparks-avatar--');
  });
});
