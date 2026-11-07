import { keywordTakenError } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { parseCampaignPlan } from "@/entities/campaigns/lib/campaign-plan-shared";
import { isValidSlug, normalizeSlug, parseSeoMd } from "@/entities/campaigns/lib/seo";
import { emDashError, faqDataError, faqError, hasFigure, readerQuestionError, readerText } from "./checks";
import { loadBlogAsset, loadBrandLedger, slugTaken, updateBlogAsset } from "./data";
import { faqBlock, seoMdFrom, type FaqItem } from "./markup";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "./model";
import { WRITER_SEO_PROMPT } from "./step-seo.prompt";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 3: the SEO and AEO pass with the brand's SEO lens. The model returns the
// package as fields; the server writes seo_md in the one labelled format
// parseSeoMd reads, so no label drift can stop the publish gate again. Passes
// when the labels parse back, the slug is valid and free, the keyword is not
// one an earlier post of the brand already owns, no FAQ question names the
// brand or asks what a source says, and the FAQ leads with a How or What
// question carrying the primary keyword. The question comes first and the
// keyword is taken from it: picking the keyword first is what produced
// questions bent around a phrase nobody types.

export const seoOutput = z.object({
  faq: z.array(z.object({
    question: z.string(),
    answer: z.string().describe("Two to four sentences, plain prose, self-contained, no Markdown. Backed by data: at least one specific figure the post body states, in digits or spelled out as the post has it, with its source named when it has one."),
  })).describe("Five questions a founder or manager would type into an AI assistant or search engine about their own problem, in their own words (\"How do I run better one-on-one meetings with AI?\"). Never name the brand, never ask what a report or post says. The FIRST starts with How or What, is the question this post answers best, and contains the primary keyword verbatim."),
  title: z.string().describe("The H1 for humans: the brand hook. May differ from the title tag."),
  title_tag: z.string().describe("Keyword-led title tag for search, at most 60 characters. Never the generic '{title} | Brand' pattern."),
  meta_description: z.string().describe("Leads with the keyword, names the benefit, ends on a hook. At most 155 characters."),
  slug: z.string().describe("kebab-case URL slug, at most 80 characters."),
  primary_keyword: z.string().describe("The phrase a real person would search, taken from inside the first FAQ question exactly as written there. Not a sentence."),
  secondary_keywords: z.array(z.string()).describe("Two to four supporting phrases."),
  excerpt: z.string().describe("One or two specific sentences for the listing card."),
  category: z.string().describe("One of the blog categories given."),
});

type SeoOut = {
  title: string; title_tag: string; meta_description: string; slug: string; primary_keyword: string;
  secondary_keywords: string[]; excerpt: string; category: string; faq: FaqItem[];
};

export const runSeo: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "The blog asset has no body to optimise." };
  const ledger = campaign.brandId ? await loadBrandLedger(campaign.brandId, campaign.id) : { ok: true as const, data: [] };
  if (!ledger.ok) return ledger;
  const taken = ledger.data.filter((r) => r.primaryKeyword || r.primaryQuestion);
  // The plan fixed the question and keyword before drafting; the package uses them.
  const plan = parseCampaignPlan(campaign.seoGeoMd);
  // The sentences in the body that state a figure, listed for the model, so
  // every FAQ answer has a number from the post to cite. House style spells
  // small numbers out, so "four layers" counts as much as "37%" does.
  const figureLines = Array.from(new Set(readerText(blog.copyMd).split(/(?<=[.!?])\s+/).filter((line) => hasFigure(line)).map((line) => line.trim()))).slice(0, 30);

  const P = WRITER_SEO_PROMPT;
  const system = fillPrompt(P.system, {
    preamble: brandPreamble(profile),
    seoLens: profile.seoLensMd ?? P.parts.noSeoLens,
    brandName: profile.brandName,
  });

  const user = fillPrompt(P.user, {
    title: blog.title,
    body: blog.copyMd,
    figures: figureLines.length ? figureLines.map((line) => `- ${line}`).join("\n") : P.parts.none,
    idea: campaign.idea ?? P.parts.none,
    seoNotes: blog.seoMd ?? P.parts.none,
    plan: plan ? fillPrompt(P.parts.plan, { question: plan.question, keyword: plan.keyword }) : "",
    taken: taken.length ? taken.map((r) => `- ${r.primaryKeyword ?? "(no keyword)"} / ${r.primaryQuestion ?? "(no question)"}`).join("\n") : P.parts.none,
  });

  // One retry inside the step with the failed checks named: the model
  // usually fixes a named rule on the second pass, and a stopped run waits an
  // hour for the schedule to re-arm it.
  let out = {} as SeoOut;
  let faq: FaqItem[] = [];
  let slug: string | null = null;
  let failures: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const feedback = attempt && failures.length ? fillPrompt(P.parts.retry, { failures: failures.map((f) => `- ${f}`).join("\n") }) : "";
    const r = await callWriterModel({ step: "seo", prompt: P, system, user: user + feedback, schema: seoOutput });
    if (!r.ok) return r;
    out = r.data;
    failures = [];
    slug = normalizeSlug(out.slug);
    if (!slug || !isValidSlug(slug)) failures.push(`Slug "${out.slug}" is not a valid kebab-case slug.`);
    else if (await slugTaken(slug, blog.id)) failures.push(`Slug "${slug}" is already in use by another post.`);
    if (!out.title_tag?.trim()) failures.push("No title tag.");
    if (!out.meta_description?.trim()) failures.push("No meta description.");
    if (/\|\s*Edge8 Blog\s*$/i.test(out.title_tag ?? "")) failures.push("Title tag is the generic '... | Edge8 Blog' pattern.");
    const owned = keywordTakenError(ledger.data, out.primary_keyword);
    if (owned) failures.push(owned);
    if (plan && (out.primary_keyword ?? "").trim().toLowerCase() !== plan.keyword.trim().toLowerCase()) {
      failures.push(`The primary keyword must be the plan's, "${plan.keyword}".`);
    }
    if (plan && (out.faq?.[0]?.question ?? "").trim() !== plan.question.trim()) {
      failures.push(`The first FAQ question must be the plan's primary question, "${plan.question}".`);
    }
    for (const e of [emDashError([out.title, out.title_tag, out.meta_description, out.excerpt].join("\n"))]) if (e) failures.push(e);
    faq = (out.faq ?? []).filter((f) => f.question?.trim() && f.answer?.trim());
    const faqProblem = faqError(faqBlock(faq), out.primary_keyword ?? null);
    if (faqProblem) failures.push(faqProblem);
    const voice = readerQuestionError(faq.map((f) => f.question), profile.brandName);
    if (voice) failures.push(voice);
    const unbacked = faqDataError(faq, `${readerText(blog.copyMd)} ${campaign.idea ?? ""}`);
    if (unbacked) failures.push(unbacked);
    if (!failures.length) break;
  }
  if (failures.length) return { ok: false, error: `SEO: ${failures.join(" ")}` };

  const seoMd = seoMdFrom({
    titleTag: out.title_tag,
    metaDescription: out.meta_description,
    slug: slug!,
    primaryKeyword: out.primary_keyword,
    secondaryKeywords: out.secondary_keywords ?? [],
    excerpt: out.excerpt,
    category: out.category,
    faq,
  });
  // The step is only done when the file it wrote reads back.
  const parsed = parseSeoMd(seoMd);
  if (!parsed.titleTag || !parsed.metaDescription || parsed.slug !== slug) {
    return { ok: false, error: "SEO: the package did not parse back through parseSeoMd." };
  }

  const fields: { seo_md: string; title?: string } = { seo_md: seoMd };
  if (out.title?.trim()) fields.title = out.title.trim();
  const saved = await updateBlogAsset(blog.id, fields);
  if (!saved.ok) return saved;
  return { ok: true, summary: `SEO package written: slug ${slug}, keyword "${out.primary_keyword}", 5 FAQ.` };
};
