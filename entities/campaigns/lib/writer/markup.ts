// The house post markup, built by the server from model-supplied text. The
// model never writes HTML: it names captions, quotes and anchor headings, and
// these builders emit exactly the blocks kernel/config/post-html-schema.ts
// admits (figure/figcaption, details/summary, div/span with a class,
// blockquote). Nothing here is styled inline; the classes carry the CSS.

export type FaqItem = { question: string; answer: string };

// Markdown inside the raw HTML blocks is not rendered, so the text that goes
// into a span or summary has to be plain. Angle brackets are escaped so a
// model that quotes markup cannot open a tag.
export function plainText(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

export function figureBlock(input: { index: number; url: string; alt: string; caption: string; source: string }): string {
  const source = plainText(input.source).replace(/\.?$/, ".");
  return [
    `<figure class="post-figure">`,
    ``,
    `![${plainText(input.alt).replace(/[[\]]/g, "")}](${input.url})`,
    ``,
    `<figcaption><strong>Exhibit ${input.index}.</strong> ${plainText(input.caption)} <span class="fig-source">Source: ${source}</span></figcaption>`,
    `</figure>`,
  ].join("\n");
}

export function ideaInBriefBlock(input: { problem: string; insight: string; wayForward: string }): string {
  const item = (head: string, body: string) =>
    `<div class="iib-item"><span class="iib-head">${head}</span><span class="iib-body">${plainText(body)}</span></div>`;
  return [
    `<div class="idea-in-brief">`,
    `<span class="iib-label">Idea in Brief</span>`,
    item("The Problem", input.problem),
    item("The Insight", input.insight),
    item("The Way Forward", input.wayForward),
    `</div>`,
  ].join("\n");
}

export function faqBlock(items: FaqItem[]): string {
  const blocks = items.map((f) =>
    [`<details class="faq-item">`, `<summary>${plainText(f.question)}</summary>`, ``, f.answer.trim(), `</details>`].join("\n"),
  );
  return [`## FAQ`, ``, ...blocks.flatMap((b) => [b, ``])].join("\n").trimEnd();
}

export function pullQuoteBlock(quote: string): string {
  return `> ${plainText(quote)}`;
}

// The FAQ the SEO step wrote into seo_md, in the one format the assemble step
// reads back:
//   1. **Q:** question
//      **A:** answer
export function faqSection(items: FaqItem[]): string {
  return ["## FAQ", ...items.map((f, i) => `${i + 1}. **Q:** ${plainText(f.question)}\n   **A:** ${f.answer.replace(/\s+/g, " ").trim()}`)].join("\n");
}

export function parseFaqSection(seoMd: string | null): FaqItem[] {
  if (!seoMd) return [];
  const items: FaqItem[] = [];
  for (const m of seoMd.matchAll(/\*\*Q:\*\*\s*([^\n]+)\n\s*\*\*A:\*\*\s*([^\n]+)/g)) {
    items.push({ question: m[1].trim(), answer: m[2].trim() });
  }
  return items;
}

// The labelled lines parseSeoMd reads. Plain labels only: "**Title tag (58
// chars):**" is exactly the drift that stopped this week's post from parsing.
export function seoMdFrom(input: {
  titleTag: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  excerpt: string;
  category: string;
  faq: FaqItem[];
}): string {
  return [
    `**Title tag:** ${input.titleTag.trim()}`,
    `**Meta description:** ${input.metaDescription.trim()}`,
    `**Slug:** ${input.slug.trim()}`,
    `**Primary keyword:** ${input.primaryKeyword.trim()}`,
    `**Secondary keywords:** ${input.secondaryKeywords.map((k) => k.trim()).filter(Boolean).join(", ")}`,
    `**Excerpt:** ${input.excerpt.trim()}`,
    `**Category:** ${input.category.trim()}`,
    ``,
    faqSection(input.faq),
  ].join("\n");
}

// ---------------------------------------------------------------- placement

export function headingLines(md: string): string[] {
  return md.split("\n").filter((l) => /^#{2,3}\s+\S/.test(l));
}

function normalizeHeading(s: string): string {
  return s.replace(/^#+\s*/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

// Insert a block right after the heading whose text matches `heading` (with
// or without its # marks, case-insensitive). Returns null when no heading
// matches, so the caller can fail the step instead of guessing a spot.
export function insertAfterHeading(md: string, heading: string, block: string): string | null {
  const lines = md.split("\n");
  const want = normalizeHeading(heading);
  const at = lines.findIndex((l) => /^#{2,3}\s+\S/.test(l) && normalizeHeading(l) === want);
  if (at < 0) return null;
  lines.splice(at + 1, 0, "", block, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Insert a block before the first H2, which is where the opening ends.
export function insertBeforeFirstH2(md: string, block: string): string {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => /^##\s+\S/.test(l));
  if (at < 0) return `${md.trimEnd()}\n\n${block}\n`;
  lines.splice(at, 0, block, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// Drop an existing "## FAQ" section (the draft may carry one) so the assembled
// FAQ is the only one.
export function stripFaq(md: string): string {
  return md.split(/^## FAQ\s*$/im)[0].trimEnd();
}

// Wrap the first occurrence of `phrase` that sits in plain prose (not in a
// heading, an existing link, or a raw HTML block) with a link. Returns null
// when the phrase is not found in prose, so the anchor text is always text the
// author wrote. The wrapped text is the phrase itself, unchanged.
export function linkPhrase(md: string, phrase: string, href: string, opts?: { external?: boolean }): string | null {
  const wrapped = opts?.external
    ? `<a href="${href}" target="_blank" rel="noopener">${phrase}</a>`
    : `[${phrase}](${href})`;
  const lines = md.split("\n");
  let inHtml = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^<(figure|details|div)\b/i.test(line)) inHtml = true;
    if (inHtml) {
      if (/^<\/(figure|details|div)>/i.test(line)) inHtml = false;
      continue;
    }
    if (/^#/.test(line) || /^>/.test(line) || /^!\[/.test(line)) continue;
    let at = line.indexOf(phrase);
    while (at >= 0) {
      // Not inside an existing link's text, its URL, or an anchor tag.
      const before = line.slice(0, at);
      const opens = (before.match(/\[/g) ?? []).length;
      const closes = (before.match(/\]/g) ?? []).length;
      const inLink = opens > closes || /\]\([^)]*$/.test(before) || /<a\s[^>]*$/i.test(before) || /<a\s[^>]*>[^<]*$/i.test(before);
      if (!inLink) {
        lines[i] = before + wrapped + line.slice(at + phrase.length);
        return lines.join("\n");
      }
      at = line.indexOf(phrase, at + phrase.length);
    }
  }
  return null;
}
