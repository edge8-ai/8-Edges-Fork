import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { CAMPAIGN_SEO_PROMPT } from "./campaign-seo.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { parseCampaignPlan, planMdFrom, withPlanSection } from "@/entities/campaigns/lib/campaign-plan-shared";
import { z } from "zod/v4";

// Drafts the search + generative-engine plan for a campaign. Unlike the freeform
// note it replaces, this produces three named sections the writer and the blog
// publisher can rely on: classic SEO, an FAQ (the questions that win featured
// snippets and ship as FAQPage JSON-LD), and GEO (the citable facts, entities,
// and question phrasings that get a page quoted by ChatGPT / Perplexity). Same
// contract as the other writers: never throws, no-ops without a key.

export const CAMPAIGN_SEO_CLASS: AiDataClass = "A";
const AI = aiSite({ site: "campaign-seo", dataClass: CAMPAIGN_SEO_CLASS, tier: "standard" });
const MODEL = AI.model;

type Result = { ok: true; seoGeoMd: string } | { ok: false; error: string };

type CampaignRow = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  brand_id: string | null;
  seo_geo_md: string | null;
};

export const campaignSeoOutput = z.object({
  seo_geo_md: z.string().describe("The full plan in Markdown with exactly these H2 sections in order: '## Search (SEO)', '## FAQ', '## GEO (generative engines)'. Search: primary keyword, 3-5 secondary keywords, title tag (<=60 chars), meta description (<=155 chars), URL slug, and 3-5 internal link targets. FAQ: 4-6 real questions a searcher types, each with a 1-2 sentence answer, written to win featured snippets and People Also Ask. GEO: the citable facts (named entities, 2-3 concrete statistics WITH their source, a one-sentence definition an LLM can quote verbatim) and 3-4 natural-language question phrasings people ask an AI assistant on this topic. Never invent statistics; if none are in the source, say what data to gather instead."),
});

const SCHEMA = jsonSchemaFor(campaignSeoOutput);

export async function generateCampaignSeoGeo(campaignId: string): Promise<Result> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const { data, error } = await companyOs.from("marketing_campaigns").select("id, name, idea, objective, brand_id, seo_geo_md")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Campaign not found." };
    const campaign = data as CampaignRow;
    if (!campaign.brand_id) {
      return { ok: false, error: "Set a brand on this campaign first, so the plan matches the brand's SEO lens." };
    }

    const profile = await getBrandProfile(campaign.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };

    // The blog asset's copy is the best source for concrete keywords and facts.
    const { data: blog, error: blogErr } = await companyOs.from("marketing_content").select("copy_md")
      .eq("campaign_id", campaignId)
      .eq("channel", "blog")
      .not("copy_md", "is", null)
      .limit(1)
      .maybeSingle();
    if (blogErr) console.error("[company-os/campaigns] marketing_content", blogErr);
    const blogCopy = (blog as { copy_md: string | null } | null)?.copy_md ?? null;

    const P = CAMPAIGN_SEO_PROMPT;
    const system = fillPrompt(P.system, {
      brandName: profile.brandName,
      positioning: profile.positioning ?? P.parts.notSet,
      audience: profile.audience ?? P.parts.notSet,
      offer: profile.offer ?? P.parts.notSet,
      seoLens: profile.seoLensMd ?? P.parts.noSeoLens,
    });

    const userMsg = fillPrompt(P.user, {
      name: campaign.name,
      goalLine: campaign.objective ? fillPrompt(P.parts.goalLine, { objective: campaign.objective }) : "",
      idea: campaign.idea ?? P.parts.noIdea,
      blogSection: blogCopy ? fillPrompt(P.parts.blogCopy, { copy: blogCopy.slice(0, 6000) }) : P.parts.noBlogCopy,
    });

    const response = await llm.messages.create({
      prompt: P,
      model: MODEL,
      max_tokens: 3000,
      system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const out = readStructuredOutput("campaign-seo", MODEL, response, campaignSeoOutput, "The model declined to draft this.");
    if (!out.ok) return { ok: false, error: out.error };
    const parsed = out.data;
    const generated = (parsed.seo_geo_md ?? "").trim();
    if (!generated) return { ok: false, error: "The strategist produced nothing usable." };
    // The campaign plan sits at the top of this document and is not the
    // strategist's to rewrite: keep it above the regenerated sections.
    const plan = parseCampaignPlan(campaign.seo_geo_md);
    const seoGeoMd = withPlanSection(generated, plan ? planMdFrom(plan) : null);

    const { error: upErr } = await companyOs.from("marketing_campaigns").update({ seo_geo_md: seoGeoMd })
      .eq("id", campaignId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, seoGeoMd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[campaign-seo] failed:", msg);
    return { ok: false, error: msg };
  }
}
