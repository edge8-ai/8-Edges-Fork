import { writeForBrand } from "@/entities/campaigns/lib/ai/brand-writer";
import { planCampaign } from "@/entities/campaigns/lib/ai/campaign-plan";
import { storeCampaignOutputs } from "@/entities/campaigns/lib/calendar-drafting";
import { ledgerLines, repeatsLastError, styleCeilingError } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { parseCampaignPlan, planMdFrom } from "@/entities/campaigns/lib/campaign-plan-shared";
import { emDashError, wordCount, wordRangeError } from "./checks";
import { loadBrandLedger } from "./data";
import { activeChannelsFrom, wordRangeFrom } from "./profile-rules";
import { WRITER_ACTOR, type StepRunner } from "./types";

// Step 1: the brand writer drafts every active channel from the approved idea.
// A campaign with no plan is planned first (campaign-plan), so the drafts take
// the planned blog type, hero style and social styles instead of choosing
// again. Passes when every active channel came back, the blog sits inside the
// brand's word range, and the planned styles are not the ones the last posts
// leaned on (a plan edited by hand is held to the same ceiling). Nothing is
// stored on a failed check, so a retry drafts again rather than editing a
// short post into shape.
export const runDraft: StepRunner = async ({ campaign, profile }) => {
  if (!campaign.brandId) return { ok: false, error: "Set a brand on this campaign first, so the writer knows the voice and channels." };
  if (!campaign.idea?.trim()) return { ok: false, error: "Write the campaign idea first; it is the brief the writer works from." };
  const range = wordRangeFrom(profile);
  if (!range) return { ok: false, error: "The brand profile states no blog word range (for example \"1500 to 2500 words\"). Add it under Marketing > Brands." };

  let plan = parseCampaignPlan(campaign.seoGeoMd);
  if (!plan) {
    const planned = await planCampaign(campaign.id);
    if (!planned.ok) return { ok: false, error: planned.error };
    plan = planned.plan;
  }

  const ledger = await loadBrandLedger(campaign.brandId, campaign.id);
  if (!ledger.ok) return ledger;
  const recent = ledger.data;

  const result = await writeForBrand({
    brandId: campaign.brandId,
    sourceText: campaign.idea,
    brief: campaign.objective || campaign.name,
    history: ledgerLines(recent.slice(0, 12)),
    plan: planMdFrom(plan),
  });
  if (!result.ok) return result;
  const planned = plan;
  const outputs = result.outputs.map((o) =>
    o.channel === "blog"
      ? { ...o, blogStyle: planned.blogType, imageStyle: planned.heroImageStyle }
      : planned.social[o.channel]
        ? { ...o, socialStyle: planned.social[o.channel] }
        : o,
  );

  const wanted = activeChannelsFrom(profile);
  const got = new Set(outputs.map((o) => o.channel));
  const missing = wanted.filter((c) => !got.has(c));
  if (missing.length) return { ok: false, error: `The writer returned no ${missing.join(", ")} deliverable; the brand's channel rules ask for it.` };

  const blog = outputs.find((o) => o.channel === "blog")!;
  const tooLong = wordRangeError(blog.bodyMd, range);
  if (tooLong) return { ok: false, error: `Draft: ${tooLong}` };
  const dash = emDashError(blog.bodyMd);
  if (dash) return { ok: false, error: `Draft: ${dash}` };
  const leaned = styleCeilingError(recent, "blogType", blog.blogStyle) ?? styleCeilingError(recent, "imageStyle", blog.imageStyle) ?? repeatsLastError(recent, "imageStyle", blog.imageStyle);
  if (leaned) return { ok: false, error: `Draft: ${leaned}` };

  const { failed } = await storeCampaignOutputs({
    campaign: { id: campaign.id, name: campaign.name, brandId: campaign.brandId, pillarId: campaign.pillarId, startsOn: campaign.startsOn },
    outputs,
    actor: WRITER_ACTOR,
  });
  if (failed.length) return { ok: false, error: `Drafted, but could not save ${failed.join(", ")}.` };

  return { ok: true, summary: `Drafted ${outputs.map((o) => o.channel).join(", ")} as planned (${planned.blogType}); blog ${wordCount(blog.bodyMd)} words.` };
};
