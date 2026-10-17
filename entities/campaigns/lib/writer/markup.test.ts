import { describe, expect, it } from "vitest";
import {
  faqBlock,
  figureBlock,
  ideaInBriefBlock,
  insertAfterHeading,
  insertBeforeFirstH2,
  linkPhrase,
  parseFaqSection,
  seoMdFrom,
  stripFaq,
} from "./markup";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";

describe("blocks", () => {
  it("builds the house figure with caption and source, escaping markup in text", () => {
    const b = figureBlock({ index: 2, url: "https://x/y.png", alt: "Two <b>bars</b>", caption: "Hours per feature", source: "Edge8 HTT" });
    expect(b).toContain(`<figure class="post-figure">`);
    expect(b).toContain(`![Two bars](https://x/y.png)`);
    expect(b).toContain(`<figcaption><strong>Exhibit 2.</strong> Hours per feature <span class="fig-source">Source: Edge8 HTT.</span></figcaption>`);
  });
  it("builds the Idea in Brief box with the three heads", () => {
    const b = ideaInBriefBlock({ problem: "p", insight: "i", wayForward: "w" });
    expect(b.match(/iib-item/g)).toHaveLength(3);
    expect(b).toContain(`<span class="iib-head">The Way Forward</span><span class="iib-body">w</span>`);
  });
  it("builds the FAQ accordion", () => {
    const b = faqBlock([{ question: "How?", answer: "Like this." }]);
    expect(b).toBe(`## FAQ\n\n<details class="faq-item">\n<summary>How?</summary>\n\nLike this.\n</details>`);
  });
});

describe("seo_md", () => {
  it("writes plain labels parseSeoMd reads, and a FAQ section the assemble step reads back", () => {
    const md = seoMdFrom({
      titleTag: "Delegate Work to AI: The Four Things",
      metaDescription: "Meta.",
      slug: "delegate-work-to-ai",
      primaryKeyword: "delegate work to AI",
      secondaryKeywords: ["AI delegation", "definition of done"],
      excerpt: "Excerpt.",
      category: "Innovation",
      faq: [{ question: "How to delegate work to AI?", answer: "Write four things." }],
    });
    const parsed = parseSeoMd(md);
    expect(parsed.titleTag).toBe("Delegate Work to AI: The Four Things");
    expect(parsed.metaDescription).toBe("Meta.");
    expect(parsed.slug).toBe("delegate-work-to-ai");
    expect(parsed.primaryKeyword).toBe("delegate work to AI");
    expect(parsed.excerpt).toBe("Excerpt.");
    expect(parsed.category).toBe("Innovation");
    expect(parseFaqSection(md)).toEqual([{ question: "How to delegate work to AI?", answer: "Write four things." }]);
  });
});

describe("placement", () => {
  const md = `Opening.\n\n## First\n\nBody one.\n\n### Sub\n\nBody two.\n\n## FAQ\n\nold`;
  it("inserts after a heading matched without its marks", () => {
    const out = insertAfterHeading(md, "first", "BLOCK");
    expect(out).toContain("## First\n\nBLOCK\n\nBody one.");
    expect(insertAfterHeading(md, "Missing", "BLOCK")).toBeNull();
  });
  it("inserts before the first H2", () => {
    expect(insertBeforeFirstH2(md, "BLOCK")).toContain("Opening.\n\nBLOCK\n\n## First");
  });
  it("strips an existing FAQ", () => {
    expect(stripFaq(md)).toBe(`Opening.\n\n## First\n\nBody one.\n\n### Sub\n\nBody two.`);
  });
});

describe("linkPhrase", () => {
  it("wraps the first prose occurrence and leaves headings, quotes and links alone", () => {
    const md = `## the process\n\n> the process\n\nSee [the process](/x/) and the process here.\n\nAlso the process.`;
    const out = linkPhrase(md, "the process", "/post/p/");
    expect(out).toBe(`## the process\n\n> the process\n\nSee [the process](/x/) and [the process](/post/p/) here.\n\nAlso the process.`);
  });
  it("skips raw HTML blocks and returns null when the phrase is not in prose", () => {
    const md = `<figure class="post-figure">\n\n![the process](u)\n\n<figcaption>the process</figcaption>\n</figure>`;
    expect(linkPhrase(md, "the process", "/post/p/")).toBeNull();
  });
  it("emits a new-tab anchor for external sources", () => {
    expect(linkPhrase("Read Every's review.", "Every's review", "https://every.to/r", { external: true })).toBe(
      `Read <a href="https://every.to/r" target="_blank" rel="noopener">Every's review</a>.`,
    );
  });
});
