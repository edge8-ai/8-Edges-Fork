import { uploadExhibit } from "@/entities/campaigns/lib/exhibits";
import { countBlocks, exhibitNumbersError } from "./checks";
import { appendBlogNotes, loadBlogAsset, updateBlogAsset } from "./data";
import { figureBlock, headingLines, insertAfterHeading } from "./markup";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "./model";
import { WRITER_EXHIBITS_PROMPT } from "./step-exhibits.prompt";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 4: the model proposes two or three exhibits as SVG built from facts
// already in the body, in the brand palette; the server renders each to PNG,
// uploads it, and places a post-figure block under the heading the model
// named. Passes when at least two figures rendered and every number an exhibit
// shows is stated in the body.

export const exhibitsOutput = z.object({
  exhibits: z.array(z.object({
    svg: z.string().describe("A complete, self-contained SVG document with viewBox=\"0 0 1600 900\", font-family Manrope, brand palette only, no <image>, <script>, <style> imports or external references. Text only for labels, values and units."),
    alt: z.string().describe("Alt text describing what the figure shows, one sentence."),
    caption: z.string().describe("The figcaption sentence: what the reader should see in the figure."),
    source: z.string().describe("Where the numbers come from, as named in the body or the idea (e.g. 'Every, Fable 5.1 review')."),
    anchor_heading: z.string().describe("The exact text of an existing ## or ### heading in the body; the figure goes right under it."),
  })).describe("Two or three exhibits."),
});

type ExhibitOut = { svg: string; alt: string; caption: string; source: string; anchor_heading: string };

const FIGURE_BLOCK = /<figure class="post-figure">[\s\S]*?<\/figure>\n?/g;

function svgProblem(svg: string): string | null {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s)) return "is not an SVG document";
  // url(#id) points at a marker or gradient inside the same SVG, which
  // diagrams use for every arrowhead; only a url() to anything else is external.
  if (/<script|<image|<foreignObject|href="https?:|url\((?!\s*['"]?#)/i.test(s)) return "references external content";
  return null;
}

export const runExhibits: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to illustrate." };

  // A retry re-renders from scratch rather than stacking figures.
  const base = blog.copyMd.replace(FIGURE_BLOCK, "").replace(/\n{3,}/g, "\n\n");
  const headings = headingLines(base);
  if (!headings.length) return { ok: false, error: "Exhibits: the body has no ## headings to place figures under." };

  const P = WRITER_EXHIBITS_PROMPT;
  const system = fillPrompt(P.system, { preamble: brandPreamble(profile), imageStyle: profile.imageStyleMd ?? P.parts.notSet });

  const user = fillPrompt(P.user, { body: base, headings: headings.join("\n") });

  const r = await callWriterModel({ step: "exhibits", prompt: P, system, user, schema: exhibitsOutput });
  if (!r.ok) return r;

  let md = base;
  const placed: string[] = [];
  for (const [i, ex] of (r.data.exhibits ?? []).entries()) {
    const label = `Exhibit ${i + 1}`;
    const bad = svgProblem(ex.svg ?? "");
    if (bad) return { ok: false, error: `Exhibits: ${label} ${bad}.` };
    const numbers = exhibitNumbersError(ex.svg, base, label);
    if (numbers) return { ok: false, error: `Exhibits: ${numbers}` };
    const up = await uploadExhibit(blog.id, ex.svg);
    if (!up.ok) return { ok: false, error: `Exhibits: ${label}: ${up.error}` };
    const block = figureBlock({ index: i + 1, url: up.url, alt: ex.alt, caption: ex.caption, source: ex.source });
    const next = insertAfterHeading(md, ex.anchor_heading, block);
    if (!next) return { ok: false, error: `Exhibits: ${label} names a heading that is not in the body ("${ex.anchor_heading}").` };
    md = next;
    placed.push(`${label}: ${ex.caption} (under "${ex.anchor_heading}")`);
  }
  if (countBlocks(md, "post-figure") < 2) return { ok: false, error: "Exhibits: fewer than two figures were placed." };

  const saved = await updateBlogAsset(blog.id, { copy_md: md });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Exhibits", placed);
  if (!noted.ok) return noted;
  return { ok: true, summary: `${placed.length} exhibits rendered and placed.` };
};
