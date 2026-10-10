// The two steps that both AI-drafting actions on the calendar share: the column
// set a writer output maps to, and the draft-broadcast sync an email
// deliverable triggers. They sit here rather than in the route's actions.ts
// because that file is "use server" (only async exports) and because both
// callers live there twice over.

import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { addDays, saigonToday } from "@/kernel/config/dates";
import type { WriterOutput } from "@/entities/campaigns/lib/ai/brand-writer";
import { createDraftBroadcastForEntry, noteWriteFailure, type CalendarChannel } from "./marketing-calendar";
import { updateContentUnlessLive } from "./blog-live-edit";

// Blog anchors the publishing window; social and email stagger after it.
export const DERIVATIVES: { channel: CalendarChannel; offsetDays: number }[] = [
  { channel: "linkedin", offsetDays: 1 },
  { channel: "facebook", offsetDays: 2 },
  { channel: "twitter", offsetDays: 3 },
  { channel: "email", offsetDays: 4 },
];

// The copy plus the style/SEO/image fields the writer chose for this piece.
// Both drafting actions below store the same column set for the same channel;
// keeping the mapping in one place is what stops them drifting apart.
export function styleFieldsFor(out: WriterOutput): CompanyOsUpdate<"marketing_content"> {
  const fields: CompanyOsUpdate<"marketing_content"> = { copy_md: out.bodyMd };
  if (out.imageStyle) fields.image_style = out.imageStyle;
  if (out.imageBriefMd) fields.image_brief_md = out.imageBriefMd;
  if (out.channel === "blog") {
    if (out.blogStyle) fields.blog_style = out.blogStyle;
    if (out.seoMd) fields.seo_md = out.seoMd;
  }
  if (out.channel === "linkedin" || out.channel === "facebook" || out.channel === "twitter") {
    if (out.socialStyle) fields.social_style = out.socialStyle;
  }
  return fields;
}

// An email deliverable also drives a draft broadcast: update the linked one if
// it is still in draft, otherwise mint a new one and link it back. Shared by
// draftWithAI and draftCampaignAssets, which differ only in what they call the
// broadcast and which date they schedule it from.
export async function syncEmailBroadcast(input: {
  failed: string[];
  broadcastId: string | null;
  entryId: string;
  name: string;
  subject: string;
  preheader: string | null;
  bodyMd: string;
  brandId: string | null;
  publishDate: string | null;
  createdBy: string;
}): Promise<void> {
  if (input.broadcastId) {
    // Only touch a broadcast still in draft.
    const { error: broadcastError } = await companyOs.from("email_campaigns").update({
        subject: input.subject,
        preheader: input.preheader,
        body_md: input.bodyMd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.broadcastId)
      .eq("status", "draft");
    noteWriteFailure(input.failed, "email broadcast", `broadcast ${input.broadcastId}`, broadcastError);
    return;
  }
  await createDraftBroadcastForEntry({
    entryId: input.entryId,
    name: input.name,
    subject: input.subject,
    preheader: input.preheader,
    bodyMd: input.bodyMd,
    brandId: input.brandId,
    publishDate: input.publishDate,
    createdBy: input.createdBy,
  });
}

// Store a writer run's outputs as the campaign's assets: one marketing_content
// row per channel, updated in place when the channel already has one, created
// when it does not, with an email deliverable also driving its draft
// broadcast. Shared by the hub's "Draft with AI" action and the writer agent's
// draft step, which must write exactly the same rows. One channel's write
// failing must not throw away the rest; the failed channels come back for the
// caller to report.
export async function storeCampaignOutputs(input: {
  campaign: { id: string; name: string; brandId: string | null; pillarId: string | null; startsOn: string | null };
  outputs: WriterOutput[];
  actor: string;
}): Promise<{ failed: string[] }> {
  const { campaign, outputs, actor } = input;
  const { data: existingData, error: existingError } = await companyOs.from("marketing_content").select("id, channel, broadcast_id")
    .eq("campaign_id", campaign.id);
  if (existingError) return { failed: [`assets (${existingError.message})`] };
  const existingByChannel = new Map(
    ((existingData ?? []) as { id: string; channel: string; broadcast_id: string | null }[]).map((e) => [e.channel, e]),
  );

  const baseDate = campaign.startsOn ?? saigonToday();
  const failed: string[] = [];

  for (const out of outputs) {
    const fields = styleFieldsFor(out);
    const title = out.title?.trim() || campaign.name;

    let targetId: string;
    let targetBroadcastId: string | null;
    const existing = existingByChannel.get(out.channel);
    if (existing) {
      // A live post on a gated campaign keeps its version (Y.91): the refusal says how to change it.
      const { error: e } = await updateContentUnlessLive(existing.id, { title, ...fields }, existing.channel);
      if (noteWriteFailure(failed, out.channel, `asset ${existing.id}`, e)) continue;
      targetId = existing.id;
      targetBroadcastId = existing.broadcast_id;
    } else {
      const offset = out.channel === "blog" ? 0 : DERIVATIVES.find((d) => d.channel === out.channel)?.offsetDays ?? 1;
      const { data: created, error: createError } = await companyOs.from("marketing_content").insert({
          title,
          brand_id: campaign.brandId,
          pillar_id: campaign.pillarId,
          campaign_id: campaign.id,
          channel: out.channel,
          status: "drafted",
          publish_date: addDays(baseDate, offset),
          created_by: actor,
          ...fields,
        })
        .select("id")
        .maybeSingle();
      if (noteWriteFailure(failed, out.channel, `campaign ${campaign.id}`, createError)) continue;
      const createdId = (created as { id: string } | null)?.id ?? null;
      if (!createdId) continue;
      targetId = createdId;
      targetBroadcastId = null;
    }

    if (out.channel === "email") {
      await syncEmailBroadcast({
        failed,
        broadcastId: targetBroadcastId,
        entryId: targetId,
        name: title,
        subject: out.subject?.trim() || title,
        preheader: out.preheader?.trim() || null,
        bodyMd: out.bodyMd,
        brandId: campaign.brandId,
        publishDate: baseDate,
        createdBy: actor,
      });
    }
  }
  return { failed };
}
