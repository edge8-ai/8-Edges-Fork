import { generateEntryImage } from "@/entities/campaigns/lib/ai/brand-image";
import type { WriterOutput } from "@/entities/campaigns/lib/ai/brand-writer";
import { storeCampaignOutputs } from "@/entities/campaigns/lib/calendar-drafting";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { siteForBrandSlug } from "@/entities/campaigns/lib/brand-sites";
import { bannedLanguageError, brandNameError, emDashError } from "./checks";
import { approveChannelAssets, listCampaignAssets, loadBlogAsset, loadBrandLedger } from "./data";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "./model";
import { WRITER_CHANNELS_PROMPT } from "./step-channels.prompt";
import { ledgerLines, styleCeilingError } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { parseCampaignPlan } from "@/entities/campaigns/lib/campaign-plan-shared";
import { activeChannelsFrom, type WriterChannel } from "./profile-rules";
import { WRITER_ACTOR, type StepRunner } from "./types";
import { z } from "zod/v4";

// Step 9: the channel posts, re-derived from the final validated blog rather
// than the draft, each with an image generated from its own brief. Runs before
// publish so the whole campaign is written in one run; the post's URL is
// known from its slug before it is live. Passes when every active channel
// other than the blog has one asset with an image. With auto-publish on the
// assets are approved, so the campaign reads as built.

export const channelsOutput = z.object({
  outputs: z.array(z.object({
    channel: z.enum(["email", "linkedin", "facebook", "twitter"]),
    title: z.string().describe("Short internal label for this deliverable."),
    subject: z.string().describe("Email subject line. Email only.").optional(),
    preheader: z.string().describe("Email preheader. Email only.").optional(),
    body_md: z.string().describe("The copy in Markdown, per the channel's rules. Email excludes the unsubscribe footer. Link to the live post where the channel rules ask for a link."),
    social_style: z.string().describe("LinkedIn/Facebook/Twitter: the planned social style for this channel when the plan names one, else a slug from the brand's preferred social styles.").optional(),
    image_style: z.string().describe("A slug from the brand's preferred image styles.").optional(),
    image_brief_md: z.string().describe("A real brief for this channel's image: the one concept, the palette from the image style, the framing. Not a copy of the blog's brief."),
  })).describe("One entry per active channel other than the blog."),
});

type Out = {
  channel: "email" | "linkedin" | "facebook" | "twitter"; title: string; subject?: string; preheader?: string; body_md: string;
  social_style?: string; image_style?: string; image_brief_md: string;
};

export const runChannels: StepRunner = async ({ campaign, profile }) => {
  const loaded = await loadBlogAsset(campaign.id);
  if (!loaded.ok) return loaded;
  const blog = loaded.data;
  if (!blog.copyMd?.trim()) return { ok: false, error: "Channels: the blog asset has no body to derive from." };
  const wanted = activeChannelsFrom(profile).filter((c): c is Exclude<WriterChannel, "blog"> => c !== "blog");
  if (!wanted.length) return { ok: true, summary: "No channels besides the blog are active." };
  const ledger = campaign.brandId ? await loadBrandLedger(campaign.brandId, campaign.id) : { ok: true as const, data: [] };
  if (!ledger.ok) return ledger;
  const recent = ledger.data;
  // The plan decided each channel's style before drafting; the posts are
  // written in it, not just labelled with it.
  const plan = parseCampaignPlan(campaign.seoGeoMd);
  const planned = wanted.filter((c) => plan?.social[c]).map((c) => `- ${c}: ${plan!.social[c]}`);

  const P = WRITER_CHANNELS_PROMPT;
  const system = fillPrompt(P.system, {
    preamble: brandPreamble(profile),
    channels: profile.channelsMd ?? P.parts.notSet,
    imageStyles: profile.preferredImageStyles.join(", ") || P.parts.noneSet,
    socialStyles: profile.preferredSocialStyles.join(", ") || P.parts.noneSet,
    wanted: wanted.join(", "),
    styleTask: planned.length ? fillPrompt(P.parts.planned, { planned: planned.join("\n") }) : P.parts.unplanned,
    recentPosts: ledgerLines(recent.slice(0, 12)),
  });
  const site = siteForBrandSlug(profile.brandSlug);
  const slug = parseSeoMd(blog.seoMd).slug;
  const liveUrl = blog.postedUrl ?? (site && slug ? `${site.domain}/post/${slug}/` : P.parts.notLive);
  const user = fillPrompt(P.user, { liveUrl, title: blog.title, body: blog.copyMd });

  const r = await callWriterModel({ step: "channels", prompt: P, system, user, schema: channelsOutput });
  if (!r.ok) return r;

  const outputs: WriterOutput[] = (r.data.outputs ?? [])
    .filter((o) => o.body_md?.trim() && wanted.includes(o.channel))
    .map((o) => ({
      channel: o.channel, title: o.title, subject: o.subject, preheader: o.preheader, bodyMd: o.body_md,
      socialStyle: plan?.social[o.channel] ?? o.social_style, imageStyle: o.image_style, imageBriefMd: o.image_brief_md,
    }));
  const missing = wanted.filter((c) => !outputs.some((o) => o.channel === c));
  if (missing.length) return { ok: false, error: `Channels: the writer returned no ${missing.join(", ")} deliverable.` };
  for (const o of outputs) {
    const bad = [emDashError(o.bodyMd), bannedLanguageError(o.bodyMd), brandNameError(o.bodyMd)].find(Boolean);
    if (bad) return { ok: false, error: `Channels (${o.channel}): ${bad}` };
    if (!o.imageBriefMd?.trim()) return { ok: false, error: `Channels (${o.channel}): no image brief.` };
    const leaned = styleCeilingError(recent, "socialStyle", o.socialStyle, o.channel);
    if (leaned) return { ok: false, error: `Channels (${o.channel}): ${leaned}` };
  }

  const { failed } = await storeCampaignOutputs({
    campaign: { id: campaign.id, name: campaign.name, brandId: campaign.brandId, pillarId: campaign.pillarId, startsOn: campaign.startsOn },
    outputs,
    actor: WRITER_ACTOR,
  });
  if (failed.length) return { ok: false, error: `Channels: could not save ${failed.join(", ")}.` };

  const assets = await listCampaignAssets(campaign.id);
  if (!assets.ok) return assets;
  for (const c of wanted) {
    const asset = assets.data.find((a) => a.channel === c);
    if (!asset) return { ok: false, error: `Channels: no ${c} asset after saving.` };
    const img = await generateEntryImage(asset.id, { createdBy: WRITER_ACTOR });
    if (!img.ok) return { ok: false, error: `Channels (${c}) image: ${img.error}` };
  }
  const after = await listCampaignAssets(campaign.id);
  if (!after.ok) return after;
  const short = wanted.filter((c) => !after.data.some((a) => a.channel === c && a.imageUrl));
  if (short.length) return { ok: false, error: `Channels: ${short.join(", ")} still have no image.` };
  if (profile.autoPublish) {
    const approved = await approveChannelAssets(campaign.id);
    if (!approved.ok) return { ok: false, error: `Channels: ${approved.error}` };
    return { ok: true, summary: `${wanted.join(", ")} written from the final post, each with an image, and approved.` };
  }
  return { ok: true, summary: `${wanted.join(", ")} drafted from the final post, each with an image.` };
};
