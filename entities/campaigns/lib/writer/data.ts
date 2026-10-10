import { companyOs } from "@/kernel/data/supabase";
import { listCampaignLedger, type LedgerRow } from "../campaign-ledger";
import { updateContentUnlessLive } from "../blog-live-edit";
import type { WriterState } from "./steps";

// The pipeline's reads and writes, kept in one file so the steps stay pure
// functions over data and the tests can swap this file for an in-memory store.
// Every Supabase call checks `error` before touching `data`.

export type WriterCampaign = {
  id: string;
  name: string;
  idea: string | null;
  objective: string | null;
  brandId: string | null;
  pillarId: string | null;
  startsOn: string | null;
  writerStep: string | null;
  writerStartedAt: string | null;
  writerError: string | null;
  seoGeoMd: string | null;
};

export type BlogAsset = {
  id: string;
  title: string;
  copyMd: string | null;
  seoMd: string | null;
  imageUrl: string | null;
  imageBriefMd: string | null;
  notes: string | null;
  status: string;
  postedUrl: string | null;
  publishDate: string | null;
};

export type BlogAssetFields = Partial<{
  title: string;
  copy_md: string;
  seo_md: string;
  notes: string;
  image_brief_md: string;
}>;

type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadCampaign(id: string): Promise<Loaded<WriterCampaign>> {
  const { data, error } = await companyOs.from("marketing_campaigns").select("id, name, idea, objective, brand_id, pillar_id, starts_on, writer_step, writer_started_at, writer_error, seo_geo_md")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Campaign not found." };
  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      idea: data.idea,
      objective: data.objective,
      brandId: data.brand_id,
      pillarId: data.pillar_id,
      startsOn: data.starts_on,
      writerStep: data.writer_step,
      seoGeoMd: data.seo_geo_md ?? null,
      writerStartedAt: data.writer_started_at,
      writerError: data.writer_error,
    },
  };
}

export async function setWriterState(
  id: string,
  state: { step: WriterState | null; error: string | null; startedAt?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fields: { writer_step: string | null; writer_error: string | null; writer_started_at?: string | null } = {
    writer_step: state.step,
    writer_error: state.error,
  };
  if (state.startedAt !== undefined) fields.writer_started_at = state.startedAt;
  const { error } = await companyOs.from("marketing_campaigns").update(fields).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The same write, only while the run is still at `from` (null for no run): a
// caller that decided on the step it read moves nothing a start, a stop or a
// decision changed in between. Answers whether it moved.
export async function moveWriterStateFrom(
  id: string,
  from: string | null,
  state: { step: WriterState; error: null; startedAt: string },
): Promise<{ ok: true; moved: boolean } | { ok: false; error: string }> {
  const base = companyOs.from("marketing_campaigns").update({ writer_step: state.step, writer_error: state.error, writer_started_at: state.startedAt }).eq("id", id);
  const { data, error } = await (from === null ? base.is("writer_step", null) : base.eq("writer_step", from)).select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, moved: Boolean(data && data.length > 0) };
}

export async function loadBlogAsset(campaignId: string): Promise<Loaded<BlogAsset>> {
  const { data, error } = await companyOs.from("marketing_content").select("id, title, copy_md, seo_md, image_url, image_brief_md, notes, status, posted_url, publish_date")
    .eq("campaign_id", campaignId)
    .eq("channel", "blog")
    .neq("status", "skipped")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "The campaign has no blog asset yet." };
  return {
    ok: true,
    data: {
      id: data.id,
      title: data.title,
      copyMd: data.copy_md,
      seoMd: data.seo_md,
      imageUrl: data.image_url,
      imageBriefMd: data.image_brief_md,
      notes: data.notes,
      status: data.status,
      postedUrl: data.posted_url,
      publishDate: data.publish_date,
    },
  };
}

export type CampaignAsset = { id: string; channel: string; status: string; imageUrl: string | null };

// Every asset on the campaign that is not skipped, for the channel step.
export async function listCampaignAssets(campaignId: string): Promise<Loaded<CampaignAsset[]>> {
  const { data, error } = await companyOs.from("marketing_content").select("id, channel, status, image_url")
    .eq("campaign_id", campaignId)
    .neq("status", "skipped");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []).map((r) => ({ id: r.id, channel: r.channel, status: r.status, imageUrl: r.image_url })) };
}

// A step's write to a live post on a gated campaign is refused (Y.91), so a
// run that reaches one stops on that step with the refusal as its error.
export async function updateBlogAsset(id: string, fields: BlogAssetFields): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await updateContentUnlessLive(id, fields);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The working notes on the blog asset carry the writer's change log, one
// dated block per step, so the hub can show what the last pass changed.
export async function appendBlogNotes(asset: BlogAsset, heading: string, lines: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const block = [`## ${heading} (${stamp})`, ...lines.map((l) => `- ${l}`)].join("\n");
  const notes = asset.notes?.trim() ? `${asset.notes.trimEnd()}\n\n${block}` : block;
  return updateBlogAsset(asset.id, { notes });
}

// True when another blog row already owns the slug.
export async function slugTaken(slug: string, selfId: string): Promise<boolean> {
  const { data, error } = await companyOs.from("marketing_content").select("id")
    .eq("channel", "blog")
    .eq("slug", slug)
    .neq("id", selfId)
    .maybeSingle();
  if (error) {
    console.error("[writer] slug lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

// With auto-publish on, the channel posts the writer derived from the final
// blog are approved as written: the brand has said it trusts the run, so the
// campaign reads as built rather than waiting on a person per channel.
export async function approveChannelAssets(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs
    .from("marketing_content")
    .update({ status: "approved" })
    .eq("campaign_id", campaignId)
    .neq("channel", "blog")
    .eq("status", "drafted");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The run's last act: the campaign is finished on the day its post goes (or
// is due to go) live. Nothing else moves a campaign to done on its own.
export async function finishCampaign(campaignId: string, endsOn: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs.from("marketing_campaigns").update({ status: "done", ends_on: endsOn }).eq("id", campaignId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// A post dated after today is handed to the daily publish routine the same way
// a person hands it on from the hub: by moving it to scheduled.
export async function scheduleBlogAsset(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs.from("marketing_content").update({ status: "scheduled" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The brand's ledger without the campaign being written, newest first: what
// the last posts chose, so the steps can choose against it.
export async function loadBrandLedger(brandId: string, selfCampaignId: string): Promise<Loaded<LedgerRow[]>> {
  const { rows, error } = await listCampaignLedger({ brandId });
  if (error) return { ok: false, error };
  return { ok: true, data: rows.filter((r) => r.campaignId !== selfCampaignId) };
}
