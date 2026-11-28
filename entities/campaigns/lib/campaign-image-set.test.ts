import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { heroBrand, imageSizeLine, planImages, planImageSet, setChannel } from "./image-router";
import { renderCard } from "./visual/render-card";
import { brandArt } from "./visual/brand-art";
import { accentFor, counterFor, lookFor } from "./visual/looks";
import { ART_FOR_ROLE, type SlideRole } from "./visual/slide-roles";
import { carouselPdf } from "./visual/carousel-pdf";
import { appLogo } from "./visual/brand-kit";
import { decodePng } from "./visual/brand-grade";
import type { Arrangement, CardWords } from "./visual/brand-rules";

describe("planImageSet", () => {
  it("makes the brand default set per channel", () => {
    const li = planImageSet({ channel: "linkedin", brandSlug: "edge8", channelTemplates: {} });
    expect(li.ok && { count: li.plan.count, format: li.plan.format, w: li.plan.width, h: li.plan.height, from: li.plan.chosenAt }).toEqual({ count: 4, format: "carousel-slide", w: 1080, h: 1350, from: "default" });
    const fb = planImageSet({ channel: "facebook", brandSlug: "ai-officer", channelTemplates: {} });
    expect(fb.ok && [fb.plan.count, fb.plan.width, fb.plan.height, fb.plan.look.brand]).toEqual([4, 1080, 1080, "ai-officer"]);
    const x = planImageSet({ channel: "twitter", brandSlug: "edge8", channelTemplates: {} });
    expect(x.ok && [x.plan.count, x.plan.format, x.plan.width]).toEqual([1, "single", 1200]);
  });

  it("follows the brand's template, and Regenerate's choice over it", () => {
    const brand = planImageSet({ channel: "linkedin", brandSlug: "edge8", channelTemplates: { linkedin: { images: 2, style: "signature" } } });
    expect(brand.ok && [brand.plan.count, brand.plan.chosenAt]).toEqual([2, "brand"]);
    const regen = planImageSet({ channel: "linkedin", brandSlug: "edge8", channelTemplates: { linkedin: { images: 2, style: "signature" } }, count: 1 });
    expect(regen.ok && [regen.plan.count, regen.plan.format, regen.plan.chosenAt]).toEqual([1, "single", "regenerate"]);
  });

  it("leaves the blog to its hero and refuses a brand with no look", () => {
    expect(planImageSet({ channel: "blog", brandSlug: "edge8", channelTemplates: {} })).toEqual({ ok: false, error: expect.stringMatching(/blog keeps its hero/) });
    expect(planImageSet({ channel: "linkedin", brandSlug: "a-client", channelTemplates: {} })).toEqual({ ok: false, error: "This brand has no look yet." });
    expect(setChannel("linkedin") && setChannel("facebook") && setChannel("twitter")).toBe(true);
    expect(setChannel("blog") || setChannel("email")).toBe(false);
  });
});

// The image router (R3.344.1): one decision per post, so the calendar drawer,
// the asset page and the writer make a post's images the same way.
describe("planImages", () => {
  it("plans a code-drawn set at the channel's size for every social channel", () => {
    const sizes = (["linkedin", "facebook", "twitter"] as const).map((channel) => {
      const r = planImages({ channel, brandSlug: "edge8", channelTemplates: {} });
      return r.ok && r.plan.engine === "code-drawn-set" ? [channel, r.plan.width, r.plan.height, r.plan.count, r.plan.style] : r;
    });
    expect(sizes).toEqual([
      ["linkedin", 1080, 1350, 4, "signature"],
      ["facebook", 1080, 1080, 4, "signature"],
      ["twitter", 1200, 1200, 1, "signature"],
    ]);
  });

  // R3.350.3: one picture, two places. The blog hero and the email banner are
  // the same 1200 x 675 drawing, made by code from the words Opus writes.
  it("plans a code-drawn hero at 1200 x 675 for the blog and the email, never a set", () => {
    const hero = { ok: true, plan: { engine: "code-drawn-hero", aspectRatio: "16:9", width: 1200, height: 675 } };
    expect(planImages({ channel: "blog" })).toEqual(hero);
    expect(planImages({ channel: "email", brandSlug: "edge8", channelTemplates: {} })).toEqual(hero);
    expect(planImages({ channel: "blog", count: 4 })).toEqual({ ok: false, error: expect.stringMatching(/blog and email take one image/) });
    expect(planImages({ channel: "email", look: "signature" })).toEqual({ ok: false, error: expect.stringMatching(/blog and email take one image/) });
  });

  // A hero is drawn in a brand's hero colours, which Edge8 and AI Officer have;
  // any other brand (a client on a fork) has none yet.
  it("knows which brands a hero can be drawn for", () => {
    expect(heroBrand("edge8") && heroBrand("ai-officer")).toBe(true);
    expect(heroBrand("a-client") || heroBrand(null) || heroBrand("toString")).toBe(false);
  });

  it("never falls back to the model for a social post", () => {
    expect(planImages({ channel: "linkedin", brandSlug: null })).toEqual({ ok: false, error: expect.stringMatching(/Set a brand on this post first/) });
    expect(planImages({ channel: "facebook", brandSlug: "a-client", channelTemplates: {} })).toEqual({ ok: false, error: "This brand has no look yet." });
    expect(planImages({ channel: "instagram", brandSlug: "edge8" })).toEqual({ ok: false, error: "There are no images for instagram posts." });
  });

  it("follows the brand's template, and a choice made on the post over it", () => {
    const templates = { linkedin: { images: 2, style: "signature" } };
    const brand = planImages({ channel: "linkedin", brandSlug: "edge8", channelTemplates: templates });
    expect(brand.ok && brand.plan.engine === "code-drawn-set" && [brand.plan.count, brand.plan.chosenAt]).toEqual([2, "brand"]);
    const count = planImages({ channel: "linkedin", brandSlug: "edge8", channelTemplates: templates, count: 1 });
    expect(count.ok && count.plan.engine === "code-drawn-set" && [count.plan.count, count.plan.format, count.plan.chosenAt]).toEqual([1, "single", "regenerate"]);
    const look = planImages({ channel: "linkedin", brandSlug: "edge8", channelTemplates: templates, look: "signature" });
    expect(look.ok && look.plan.engine === "code-drawn-set" && [look.plan.count, look.plan.style, look.plan.chosenAt]).toEqual([2, "signature", "regenerate"]);
  });

  it("refuses a look the brand has not got yet, with the reason", () => {
    expect(planImages({ channel: "linkedin", brandSlug: "ai-officer", channelTemplates: {}, look: "editorial" })).toEqual({
      ok: false,
      error: "The Editorial look is not built for this brand yet; choose Signature.",
    });
    expect(planImages({ channel: "facebook", brandSlug: "ai-officer", channelTemplates: {}, look: "campaign-set" })).toEqual({
      ok: false,
      error: "The Campaign set look is not built for this brand yet; choose Signature.",
    });
  });

  // R3.347.1: Edge8 has Editorial and Campaign set; the plan carries the look
  // the cards are drawn in, from the post's choice or the brand's template.
  it("plans Edge8's Editorial and Campaign set looks", () => {
    const editorial = planImages({ channel: "linkedin", brandSlug: "edge8", channelTemplates: {}, look: "editorial" });
    expect(editorial.ok && editorial.plan.engine === "code-drawn-set" && [editorial.plan.style, editorial.plan.look.name, editorial.plan.look.brand, editorial.plan.count]).toEqual(["editorial", "Editorial", "edge8", 4]);
    const fromTemplate = planImages({ channel: "facebook", brandSlug: "edge8", channelTemplates: { facebook: { images: 2, style: "campaign-set" } } });
    expect(fromTemplate.ok && fromTemplate.plan.engine === "code-drawn-set" && [fromTemplate.plan.style, fromTemplate.plan.look.name, fromTemplate.plan.count, fromTemplate.plan.chosenAt]).toEqual(["campaign-set", "Campaign set", 2, "brand"]);
    const signature = planImages({ channel: "linkedin", brandSlug: "edge8", channelTemplates: {} });
    expect(signature.ok && signature.plan.engine === "code-drawn-set" && [signature.plan.style, signature.plan.look.name]).toEqual(["signature", "Signature"]);
  });
});

// The size line under a post's images (R3.344.4).
describe("imageSizeLine", () => {
  it("names each channel's shape and pixels, the blog's hero included", () => {
    expect(imageSizeLine("linkedin")).toBe("LinkedIn · 4:5 · 1080×1350");
    expect(imageSizeLine("facebook")).toBe("Facebook · 1:1 · 1080×1080");
    expect(imageSizeLine("twitter")).toBe("X · 1:1 · 1200×1200");
    expect(imageSizeLine("email")).toBe("Email · 16:9 · 1200×675");
    expect(imageSizeLine("blog")).toBe("Blog · 16:9 · 1200×675");
    expect(imageSizeLine(null)).toBeNull();
  });

  it("adds a made set's number of images and look", () => {
    expect(imageSizeLine("linkedin", { count: 4, style: "signature" })).toBe("LinkedIn · 4:5 · 1080×1350 · 4 images · Signature");
    expect(imageSizeLine("twitter", { count: 1, style: "signature" })).toBe("X · 1:1 · 1200×1200 · 1 image · Signature");
  });
});

// The same steps generateImageSet takes after the words come back, without the
// database or the model: each brand's set at LinkedIn's size, its logo from
// the brand kit, and the carousel PDF.
const SLIDES: { role: SlideRole; arrangement: Arrangement; words: CardWords; noteOnItem?: number }[] = [
  { role: "hook", arrangement: "headline", words: { kicker: "Most leadership teams are comparing seat prices.", headline: "That is the wrong comparison.", accent: "the wrong comparison." } },
  { role: "support", arrangement: "steps", noteOnItem: 1, words: { headline: "The secure door, five rules.", accent: "five rules.", items: ["A default-deny database role.", "Redaction by column.", "Read first, write only with human approval.", "Every person signs in as themselves.", "Log everything with one off switch."], note: "The security boundary is the database." } },
  { role: "key", arrangement: "columns", words: { headline: "Build one door.", accent: "one door.", labels: ["Seat prices", "Central database"], under: "The vendor becomes a swappable seat." } },
  { role: "close", arrangement: "headline", words: { kicker: "Five questions to ask before buying a single seat.", headline: "You're comparing the wrong thing.", accent: "the wrong thing." } },
];

describe("a full set, as Generate images draws it", () => {
  const SETS = [["edge8", "signature"], ["ai-officer", "signature"], ["edge8", "editorial"], ["edge8", "campaign-set"]] as const;
  for (const [brand, style] of SETS) {
    it(`${brand} ${style}: four slides at 1080 x 1350 and a four-page carousel PDF`, async () => {
      const look = lookFor(brand, style)!;
      const kit = appLogo(brand, look.groundKind)!;
      const logo = { data: readFileSync(kit.file), mime: kit.mime, width: kit.width, height: kit.height };
      const pngs: Buffer[] = [];
      for (const [i, s] of SLIDES.entries()) {
        const png = await renderCard({
          look, arrangement: s.arrangement, words: s.words, width: 1080, height: 1350,
          art: await brandArt(brand, ART_FOR_ROLE[s.role], 1080, 1350, style),
          counter: counterFor(look, i, 4), cover: i === 0, noteOnItem: s.noteOnItem, logo, accent: accentFor(look, s.role),
        });
        const img = decodePng(png);
        expect([img.width, img.height]).toEqual([1080, 1350]);
        pngs.push(png);
      }
      const pdf = carouselPdf(pngs).toString("latin1");
      expect(pdf.match(/\/MediaBox \[0 0 1080 1350\]/g)).toHaveLength(4);
    }, 60_000);
  }

  it("counts the slides the way each look reads", () => {
    expect(counterFor(lookFor("edge8", "signature")!, 1, 4)).toBe("02 / 04");
    expect(counterFor(lookFor("ai-officer", "signature")!, 0, 2)).toBe("01 / 02");
    expect(counterFor(lookFor("edge8", "campaign-set")!, 2, 4)).toBe("03 / 04");
    // Editorial numbers its slides: "Slide number top-left".
    expect(counterFor(lookFor("edge8", "editorial")!, 2, 4)).toBe("03");
    // A single image has no set to count.
    expect(counterFor(lookFor("edge8", "editorial")!, 0, 1)).toBeNull();
    expect(counterFor(lookFor("edge8", "signature")!, 0, 1)).toBeNull();
  });
});
