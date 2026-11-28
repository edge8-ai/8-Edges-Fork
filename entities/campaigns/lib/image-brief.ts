// A post's image brief: the things decided before its picture is made, written
// as markdown sections in marketing_content.image_brief_md:
//
//   ## Point
//   ...
//   ## Layout
//   ...
//
// Which sections depends on the channel. A blog post's hero and an email's
// banner are code-drawn from the post's figures (R3.350), so their brief asks
// for the point, the figures and the layout. A social post keeps the five
// sections of MS19 (R3.343).
//
// The brief stays one free text everywhere it is edited and sent; nothing
// parses it, so a brief written under the old headings still works. These
// headings are the one list the writer is asked for and the post's drawer
// offers as its placeholder, so the two cannot drift apart.
//
// Pure only: the post's drawer imports this module in the browser.

import { imageEngine } from "@/entities/campaigns/lib/image-router";

type BriefKind = "hero" | "social";

// What each heading asks the writer to decide, in the order the sections are
// written. The headings are read from these keys, so a heading cannot reach
// the drawer or the writer without its question. The decisions line is the
// drawer's hint above the brief.
const BRIEFS: Record<BriefKind, { forPosts: string; decisions: string; asks: Record<string, string> }> = {
  hero: {
    forPosts: "For a blog post or an email",
    decisions: "Three decisions: the point, the figures and the layout.",
    asks: {
      Point: "the one thing the picture says",
      Figures: "the numbers to show, as the post states them",
      Layout: "stat, pair, row or steps, or your choice",
    },
  },
  social: {
    forPosts: "For a LinkedIn, Facebook or X post",
    decisions: "Five decisions: subject, style, environment, lighting and mood, details.",
    asks: {
      Subject: "who or what is in the picture, and what they are doing",
      Style: "the medium, such as napkin art, an editorial illustration or a concept card",
      Environment: "where it sits, and where the camera is",
      "Lighting and mood": "where the light comes from, and how it should feel",
      Details: "the exact words to set, a handful at most, spelled out in quotes; the signature; the one accent",
    },
  },
};

// A social post's images are a code-drawn set, read through the image router
// so the brief follows the same decision the drawer and the maker act on.
// Every other post (the blog, the email, one with no channel yet) makes one
// picture, the code-drawn hero.
function briefKind(channel: string | null | undefined): BriefKind {
  return imageEngine(channel) === "code-drawn-set" ? "social" : "hero";
}

/** The brief's headings for a post on this channel, in order. */
export function imageBriefHeadings(channel: string | null | undefined): string[] {
  return Object.keys(BRIEFS[briefKind(channel)].asks);
}

/** The empty brief's starting shape: each heading on its own line, a blank line between them for the text. */
export function imageBriefPlaceholder(channel: string | null | undefined): string {
  return imageBriefHeadings(channel).map((h) => `## ${h}`).join("\n\n");
}

/** The drawer's one-line summary of what the brief decides for a post on this channel. */
export function imageBriefDecisions(channel: string | null | undefined): string {
  return BRIEFS[briefKind(channel)].decisions;
}

function sectionsFor(kind: BriefKind): string[] {
  const { forPosts, asks } = BRIEFS[kind];
  const headings = Object.keys(asks);
  const last = headings.length - 1;
  return [
    `${forPosts}, write it as these Markdown sections, in this order, each a heading line followed by its text:`,
    ...headings.map((h, i) => `## ${h} (${asks[h]})${i === last ? "." : ","}`),
  ];
}

// What the writer is told about image_brief_md, after a lead naming whose
// brief it is. One schema field carries every channel's brief, so it asks for
// both, each under the posts it is for. The closing line belongs to the social
// brief: a code-drawn set takes its palette, type and wordmark from the brand
// kit, so a brief that restates them is wasted words. No image maker reads
// Style DNA (R3.350), so the line no longer says it is sent with the image.
// The hero's brief asks for figures, not looks, and needs no such line. It
// reaches the model through a
// Zod .describe(), which the prompt version does not hash
// (kernel/ai/prompts.ts), so a change here needs no recorded eval;
// schema-equivalence.test.ts pins the text instead.
export function imageBriefInstruction(lead: string): string {
  return [
    lead,
    ...sectionsFor("hero"),
    ...sectionsFor("social"),
    "For those posts the image is drawn by code in the brand's look, which already fixes the palette, type and wordmark,",
    "so never restate colours, hex codes or fonts; decide only what this one image needs.",
  ].join(" ");
}
