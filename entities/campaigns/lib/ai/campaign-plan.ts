import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { listCampaignLedger } from "@/entities/campaigns/lib/campaign-ledger";
import { ledgerLines } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { planErrors, planMdFrom, withPlanSection, type CampaignPlan } from "@/entities/campaigns/lib/campaign-plan-shared";
import { activeChannelsFrom } from "@/entities/campaigns/lib/writer/profile-rules";
import { brandPreamble, callWriterModel } from "@/entities/campaigns/lib/writer/model";
import { fillPrompt } from "@/kernel/ai/prompts";
import { WRITER_PLAN_PROMPT } from "./campaign-plan.prompt";
import { z } from "zod/v4";

// Plans a campaign from its idea before the writer drafts: the primary
// question, the keyword inside it, the blog type, the hero image style and a
// style per social channel, chosen from the content and against what the
// brand's recent posts already used. The plan is checked (planErrors) and
// saved as the "## Plan" section of the campaign's SEO/GEO plan; the writer
// then follows it instead of choosing again. Never throws.

export const campaignPlanOutput = z.object({
  question: z.string().describe("The one question a founder or manager would type into ChatGPT or Google about their own problem, in their own words, that this campaign answers best with a figure from the idea. Starts with How or What. Never names the brand, never asks what a report or post says."),
  keyword: z.string().describe("The phrase a person would search, taken from inside the question exactly as written there. Not a sentence."),
  angle: z.string().describe("One plain sentence: what this campaign argues and for whom."),
  blog_type: z.string().describe("A slug from the brand's preferred blog types that fits the shape of the idea."),
  hero_image_style: z.string().describe("A slug from the brand's preferred image styles for the blog hero."),
  social: z.array(z.object({
    channel: z.enum(["linkedin", "facebook", "twitter"]),
    style: z.string().describe("A slug from the brand's preferred social styles that fits this channel and this idea."),
  })).describe("One entry per active social channel."),
});

type PlanOut = { question: string; keyword: string; angle: string; blog_type: string; hero_image_style: string; social: { channel: string; style: string }[] };

type PlanResult = { ok: true; plan: CampaignPlan; seoGeoMd: string } | { ok: false; error: string };

// Plans the campaign and saves the plan section. The save is the only write.
export async function planCampaign(campaignId: string): Promise<PlanResult> {
  const proposed = await proposeCampaignPlan(campaignId);
  if (!proposed.ok) return proposed;
  try {
    const { error: upErr } = await companyOs.from("marketing_campaigns").update({ seo_geo_md: proposed.seoGeoMd }).eq("id", campaignId);
    if (upErr) return { ok: false, error: upErr.message };
    return proposed;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Everything planCampaign does except the save: the plan, checked, and the
// SEO/GEO plan it would write. Split out so the writer eval
// (scripts/writer-eval/) can replay the plan against a read-only database
// and keep the result in its own sandbox; production always goes through
// planCampaign.
export async function proposeCampaignPlan(campaignId: string): Promise<PlanResult> {
  try {
    const { data, error } = await companyOs.from("marketing_campaigns").select("id, name, idea, objective, brand_id, seo_geo_md")
      .eq("id", campaignId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Campaign not found." };
    if (!data.brand_id) return { ok: false, error: "Set a brand on this campaign first, so the plan uses the brand's styles." };
    if (!data.idea?.trim()) return { ok: false, error: "Write the campaign idea first; the plan is drawn from it." };

    const profile = await getBrandProfile(data.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };
    const { rows, error: ledgerError } = await listCampaignLedger({ brandId: data.brand_id });
    if (ledgerError) return { ok: false, error: ledgerError };
    const recent = rows.filter((r) => r.campaignId !== campaignId);
    const socialChannels = activeChannelsFrom(profile).filter((c) => c === "linkedin" || c === "facebook" || c === "twitter");

    const P = WRITER_PLAN_PROMPT;
    const system = fillPrompt(P.system, {
      preamble: brandPreamble(profile),
      brandName: profile.brandName,
      socialChannels: socialChannels.join(", ") || P.parts.noSocialChannels,
      blogTypes: profile.preferredBlogTypes.join(", ") || P.parts.anyStyle,
      imageStyles: profile.preferredImageStyles.join(", ") || P.parts.anyStyle,
      socialStyles: profile.preferredSocialStyles.join(", ") || P.parts.anyStyle,
      recentPosts: ledgerLines(recent.slice(0, 12)),
    });
    const user = fillPrompt(P.user, {
      name: data.name,
      goal: data.objective ? fillPrompt(P.parts.goal, { objective: data.objective }) : "",
      idea: data.idea,
    });

    const r = await callWriterModel({ step: "plan", prompt: P, system, user, schema: campaignPlanOutput });
    if (!r.ok) return r;
    const plan: CampaignPlan = {
      angle: r.data.angle ?? "",
      question: r.data.question ?? "",
      keyword: r.data.keyword ?? "",
      blogType: r.data.blog_type ?? "",
      heroImageStyle: r.data.hero_image_style ?? "",
      social: Object.fromEntries((r.data.social ?? []).map((s) => [s.channel, s.style])),
    };
    const errors = planErrors(plan, {
      brandName: profile.brandName,
      recent,
      blogTypes: profile.preferredBlogTypes,
      imageStyles: profile.preferredImageStyles,
      socialStyles: profile.preferredSocialStyles,
      socialChannels,
    });
    if (errors.length) return { ok: false, error: `Plan: ${errors.join(" ")}` };

    return { ok: true, plan, seoGeoMd: withPlanSection(data.seo_geo_md, planMdFrom(plan)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
