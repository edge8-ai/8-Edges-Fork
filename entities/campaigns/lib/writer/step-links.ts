import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { auditLinkError, internalPostLinks, isInternalUrl, readerText } from "./checks";
import { appendBlogNotes, loadBlogAsset, loadBrandLedger, updateBlogAsset } from "./data";
import { linkPhrase } from "./markup";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "./model";
import { WRITER_LINKS_PROMPT } from "./step-links.prompt";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 6: internal links to related published posts and source links at first
// mention, wrapped around phrases already in the body. The candidates are the
// brand's published posts from the ledger, each with its keyword and the
// question it answers, so the model links on topic rather than on excerpt. The
// model picks; the server does the wrapping, so the anchor text is always the
// author's words. Passes when the internal-link floor is met and the reader
// text is unchanged.

export const linksOutput = z.object({
  internal: z.array(z.object({
    phrase: z.string().describe("A phrase copied exactly from a body paragraph (not a heading or quote), three to eight words, that reads as descriptive anchor text for the target post."),
    slug: z.string().describe("The slug of a related published post from the list given."),
  })).describe("Two to four related published posts to link to."),
  sources: z.array(z.object({
    phrase: z.string().describe("The exact phrase in the body where the source is first mentioned."),
    url: z.string().describe("The source URL, copied exactly from the idea."),
  })).describe("One link per source the idea supplies, at its first mention in the body. Empty if the idea names no URLs."),
});

type LinksOut = { internal: { phrase: string; slug: string }[]; sources: { phrase: string; url: string }[] };

export const runLinks: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to link." };
  const selfSlug = parseSeoMd(blog.seoMd).slug;
  if (!campaign.brandId) return { ok: false, error: "Links: the campaign has no brand, so there are no posts to link to." };

  const ledger = await loadBrandLedger(campaign.brandId, campaign.id);
  if (!ledger.ok) return ledger;
  const posts = ledger.data.filter((p) => p.slug && p.slug !== selfSlug && p.blogStatus === "published").slice(0, 40);
  if (posts.length < 2) return { ok: false, error: "Links: fewer than two published posts to link to." };
  const bySlug = new Map(posts.map((p) => [p.slug!, p]));
  const sourceUrls = Array.from(new Set(Array.from((campaign.idea ?? "").matchAll(/https?:\/\/[^\s)>\]"']+/g)).map((m) => m[0].replace(/[.,;:]+$/, ""))));

  const P = WRITER_LINKS_PROMPT;
  const system = fillPrompt(P.system, { preamble: brandPreamble(profile) });
  const user = fillPrompt(P.user, {
    body: blog.copyMd,
    posts: posts.map((p) => `${p.slug}: ${p.title ?? p.campaignName}. ${p.primaryKeyword ?? "no keyword"}; ${p.primaryQuestion ?? "no question"}`).join("\n"),
    sourceUrls: sourceUrls.length ? sourceUrls.join("\n") : P.parts.noSourceUrls,
  });

  const r = await callWriterModel({ step: "links", prompt: P, system, user, schema: linksOutput });
  if (!r.ok) return r;

  let md = blog.copyMd;
  const log: string[] = [];
  for (const l of r.data.internal ?? []) {
    if (!bySlug.has(l.slug)) continue;
    const next = linkPhrase(md, l.phrase.trim(), `/post/${l.slug}/`);
    if (!next) continue;
    md = next;
    log.push(`"${l.phrase.trim()}" -> /post/${l.slug}/`);
  }
  const internal = internalPostLinks(md);
  if (internal.length < 2) {
    return { ok: false, error: `Links: only ${internal.length} internal link(s) could be placed on phrases in the body; two are required.` };
  }
  for (const s of r.data.sources ?? []) {
    const url = s.url.trim();
    if (!sourceUrls.includes(url)) continue;
    const next = linkPhrase(md, s.phrase.trim(), url, { external: !isInternalUrl(url) });
    if (!next) continue;
    md = next;
    log.push(`"${s.phrase.trim()}" -> ${url}`);
  }
  const audit = auditLinkError(md);
  if (audit) return { ok: false, error: `Links: ${audit}` };
  if (readerText(md) !== readerText(blog.copyMd)) return { ok: false, error: "Links: the anchor text changed the reader's text." };

  const saved = await updateBlogAsset(blog.id, { copy_md: md });
  if (!saved.ok) return saved;
  const noted = await appendBlogNotes(blog, "Links", log);
  if (!noted.ok) return noted;
  return { ok: true, summary: `${internal.length} internal link(s), ${log.length - internal.length} source link(s).` };
};
