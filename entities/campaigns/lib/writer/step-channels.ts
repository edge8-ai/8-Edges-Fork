import { makePostImages } from "@/entities/campaigns/lib/post-images";
import { heroBrand, imageEngine } from "@/entities/campaigns/lib/image-router";
import { builtStyles } from "@/entities/campaigns/lib/visual/brand-kit";
import type { WriterOutput } from "@/entities/campaigns/lib/ai/brand-writer";
import { storeCampaignOutputs } from "@/entities/campaigns/lib/calendar-drafting";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { imageBriefInstruction } from "@/entities/campaigns/lib/image-brief";
import { siteForBrandSlug } from "@/entities/campaigns/lib/brand-sites";
import { bannedLanguageError, brandNameError, emDashError } from "./checks";
import { approveChannelAssets, listCampaignAssets, loadBlogAsset, loadBrandLedger } from "./data";
import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callCheckedWriterModel } from "./model";
import { WRITER_CHANNELS_PROMPT } from "./step-channels.prompt";
import { ledgerLines, styleCeilingError } from "@/entities/campaigns/lib/campaign-ledger-shared";
import { parseCampaignPlan } from "@/entities/campaigns/lib/campaign-plan-shared";
import { activeChannelsFrom, type WriterChannel } from "./profile-rules";
import { WRITER_ACTOR, type StepRunner } from "./types";
import { z } from "zod/v4";

// Step 9: the channel posts, re-derived from the final validated blog rather
// than the draft, each with its images made through the image router
// (../post-images): a code-drawn set for a social post, drawn from its copy,
// and a code-drawn hero for the email banner. Runs before
// publish so the whole campaign is written in one run; the post's URL is
// known from its slug before it is live. Passes when every active channel
// other than the blog has one asset with an image, except a social post whose
// brand has no look yet, or an email whose brand has no hero colours yet,
// which is written without one. With auto-publish on the
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
    image_brief_md: z.string().describe(imageBriefInstruction("A real brief for this channel's image, not a copy of the blog's brief.")),
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
    preamble: brandPreamble(profile, campaign.idea),
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

  // A style the plan settled is the one the deliverable takes, whatever the
  // model picks, so when the brand's recent posts have leaned on it since the
  // plan was made, no answer can pass the ceiling below. Stop before paying
  // for one (Y.96: in October such answers were bought and refused up to three
  // times per campaign). The next tick checks again, once newer posts have
  // moved the window on.
  for (const c of wanted) {
    const leaned = styleCeilingError(recent, "socialStyle", plan?.social[c], c);
    if (leaned) return { ok: false, error: `Channels (${c}): ${leaned}` };
  }

  // A failed check gets one retry inside the step, named (Y.96). Each failure
  // names its channel, so the step's error needs no label of its own.
  const r = await callCheckedWriterModel({
    step: "channels",
    prompt: P,
    system,
    user,
    schema: channelsOutput,
    // Kept back from the retry for what follows a passing answer: saving the
    // deliverables (about 10 s), the email banner's code-drawn hero (Opus's
    // words, retried once, then the drawing: kept at the 35 s the painted
    // banner was given), and a code-drawn set per social
    // post, each a model call for the card words plus up to four drawn cards,
    // their uploads and LinkedIn's PDF (about 30 s each, so 90 s for three).
    // 135 s of the step's 280 s call budget (model.ts), inside the route's
    // 300 s maxDuration (run-step.ts); the retry gets what the first call left
    // of the other 145 s.
    afterMs: 135_000,
    check: (out) => {
      const outputs: WriterOutput[] = (out.outputs ?? [])
        .filter((o) => o.body_md?.trim() && wanted.includes(o.channel))
        .map((o) => ({
          channel: o.channel, title: o.title, subject: o.subject, preheader: o.preheader, bodyMd: o.body_md,
          socialStyle: plan?.social[o.channel] ?? o.social_style, imageStyle: o.image_style, imageBriefMd: o.image_brief_md,
        }));
      const failures: string[] = [];
      const missing = wanted.filter((c) => !outputs.some((o) => o.channel === c));
      if (missing.length) failures.push(`Channels: the writer returned no ${missing.join(", ")} deliverable.`);
      for (const o of outputs) {
        // Every problem is named, not only the first, so the retry fixes them all.
        for (const bad of [emDashError(o.bodyMd), bannedLanguageError(o.bodyMd, campaign.idea), brandNameError(o.bodyMd)]) {
          if (bad) failures.push(`Channels (${o.channel}): ${bad}`);
        }
        // No post is held for a missing image brief (R3.350.4): a social
        // post's set is drawn from its copy, and the email's code-drawn banner
        // is made from the post's figures, reading the brief only when one
        // was written.
        const leaned = styleCeilingError(recent, "socialStyle", o.socialStyle, o.channel);
        if (leaned) failures.push(`Channels (${o.channel}): ${leaned}`);
      }
      if (failures.length) return { ok: false, failures };
      return { ok: true, value: outputs };
    },
  });
  if (!r.ok) return r;
  const outputs = r.data;

  const { failed } = await storeCampaignOutputs({
    campaign: { id: campaign.id, name: campaign.name, brandId: campaign.brandId, pillarId: campaign.pillarId, startsOn: campaign.startsOn },
    outputs,
    actor: WRITER_ACTOR,
  });
  if (failed.length) return { ok: false, error: `Channels: could not save ${failed.join(", ")}.` };

  // A social post's images are a code-drawn set in the brand's look, and the
  // email banner is a code-drawn hero in the brand's hero colours. A brand
  // with no look yet, or no hero colours yet (any brand on a fork, until it
  // gets them), has those posts written without images rather than the
  // campaign stopped, because a missing image should not stop a campaign
  // (spec, decided 2026-11-21; the hero half by the R3.350 review).
  const noLook = builtStyles(profile.brandSlug).length === 0;
  const noHero = !heroBrand(profile.brandSlug);
  const noSet = wanted.filter((c) => noLook && imageEngine(c) === "code-drawn-set");
  const heroless = wanted.filter((c) => noHero && imageEngine(c) === "code-drawn-hero");
  const skipped = [...noSet, ...heroless];

  const assets = await listCampaignAssets(campaign.id);
  if (!assets.ok) return assets;
  for (const c of wanted) {
    const asset = assets.data.find((a) => a.channel === c);
    if (!asset) return { ok: false, error: `Channels: no ${c} asset after saving.` };
    if (skipped.includes(c)) continue;
    const img = await makePostImages({ id: asset.id, channel: asset.channel }, { createdBy: WRITER_ACTOR });
    if (!img.ok) return { ok: false, error: `Channels (${c}) image: ${img.error}` };
  }
  const after = await listCampaignAssets(campaign.id);
  if (!after.ok) return after;
  const short = wanted.filter((c) => !skipped.includes(c) && !after.data.some((a) => a.channel === c && a.imageUrl));
  if (short.length) return { ok: false, error: `Channels: ${short.join(", ")} still have no image.` };
  const notes = [
    noSet.length ? `with no images for ${noSet.join(", ")}, as this brand has no look yet` : null,
    heroless.length ? `with no hero drawn for ${heroless.join(", ")}, as this brand has no hero colours yet` : null,
  ].filter((n): n is string => n !== null);
  const images = notes.length ? notes.join(", and ") : "each with an image";
  if (profile.autoPublish) {
    const approved = await approveChannelAssets(campaign.id);
    if (!approved.ok) return { ok: false, error: `Channels: ${approved.error}` };
    return { ok: true, summary: `${wanted.join(", ")} written from the final post, ${images}, and approved.` };
  }
  return { ok: true, summary: `${wanted.join(", ")} drafted from the final post, ${images}.` };
};
