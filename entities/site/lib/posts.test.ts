import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderPostMarkdown } from "./posts";

// Importing through the entity door builds the service-role Supabase client at
// module load; on CI's Node 20 its realtime layer throws without a WebSocket
// polyfill. This test never touches the database, so the client is stubbed.
vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: {}, htt: {} }));

// Seam under test: renderPostMarkdown, the one markdown -> HTML pipeline every
// blog body (file-backed or DB-backed, via lib/blog.ts) goes through before it
// lands in dangerouslySetInnerHTML on app/post/[slug]/page.tsx.

describe("renderPostMarkdown", () => {
  it("removes script tags and strips inline event handlers", async () => {
    const html = await renderPostMarkdown(
      "Intro\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n",
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/alert\(1\)/);
    expect(html).not.toMatch(/onerror/i);
    expect(html).toMatch(/<img src="x">/);
  });

  it("keeps figure/figcaption and the FAQ accordion intact, class included", async () => {
    const html = await renderPostMarkdown(
      [
        '<figure class="post-figure"><img src="/x.webp"><figcaption>Cap</figcaption></figure>',
        "",
        '<details class="faq-item"><summary>Q</summary>A</details>',
        "",
      ].join("\n"),
    );
    expect(html).toMatch(
      /<figure class="post-figure"><img src="\/x\.webp"><figcaption>Cap<\/figcaption><\/figure>/,
    );
    expect(html).toMatch(/<details class="faq-item"><summary>Q<\/summary>A<\/details>/);
  });

  it("removes javascript: hrefs", async () => {
    const html = await renderPostMarkdown(
      '[md link](javascript:alert(1))\n\n<a href="javascript:alert(1)">raw</a>\n\n[ok](https://example.com)\n',
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toMatch(/<a href="https:\/\/example\.com">ok<\/a>/);
  });

  // Regression guard for the allow-list: three posts from the static blog source
  // (git c08f4100^, content/blog/**) that use <figure> and <details class="faq-item">,
  // rendered with the pre-sanitize pipeline (sanitize:false) and snapshotted to
  // the .html files next to them. The allow-list must reproduce them byte for
  // byte, with one deliberate exception: text inside raw HTML is now re-serialized
  // by hast-util-to-html, so a bare "&" an author typed in raw markup ("P&L")
  // comes out as the equivalent "&#x26;" (the pre-change pipeline passed the raw
  // string through untouched). Both sides are compared with character references
  // decoded, so tags, attributes and text must still match exactly.
  const decodeRefs = (html: string) =>
    html.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    );

  it.each([
    "the-other-50-percent-of-leadership",
    "three-levels-of-model-usage",
    "your-prompts-are-expiring",
  ])('renders fixture "%s" identically to the pre-sanitize snapshot', async (slug) => {
    const dir = new URL("./__fixtures__/posts/", import.meta.url);
    const markdown = readFileSync(new URL(`${slug}.md`, dir), "utf8");
    const expected = readFileSync(new URL(`${slug}.html`, dir), "utf8");
    expect(markdown, "fixture must exercise figure/details").toMatch(/<figure|<details/);
    expect(decodeRefs(await renderPostMarkdown(markdown))).toBe(decodeRefs(expected));
  });
});
