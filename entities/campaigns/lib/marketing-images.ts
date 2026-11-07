import { companyOs } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import { liveEditRefusal } from "./blog-live-edit";

// Image version history for a content asset. Every generated or uploaded image
// is kept as a row here with the prompt that produced it; exactly one row per
// entry is selected, and marketing_content.image_url mirrors the selected url so
// existing reads keep working. A partial unique index enforces one selected row.

export type AssetImage = {
  id: string;
  entryId: string;
  url: string;
  promptUsed: string | null;
  model: string | null;
  isSelected: boolean;
  createdAt: string;
};

type DbImage = {
  id: string;
  entry_id: string;
  url: string;
  prompt_used: string | null;
  model: string | null;
  is_selected: boolean;
  created_at: string;
};

function mapImage(r: DbImage): AssetImage {
  return {
    id: r.id,
    entryId: r.entry_id,
    url: r.url,
    promptUsed: r.prompt_used,
    model: r.model,
    isSelected: r.is_selected,
    createdAt: r.created_at,
  };
}

export async function listAssetImages(entryId: string): Promise<AssetImage[]> {
  const { data, error: imagesErr } = await companyOs.from("marketing_asset_images").select("id, entry_id, url, prompt_used, model, is_selected, created_at")
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });
  if (imagesErr) console.error("[company-os/campaigns] marketing_asset_images", imagesErr);
  return ((data ?? []) as DbImage[]).map(mapImage);
}

// Unselect the current selection first (the partial unique index allows only one
// selected row), then mirror onto image_url.
async function selectAndMirror(entryId: string, imageId: string, url: string): Promise<Result> {
  const { error: unsel } = await companyOs.from("marketing_asset_images").update({ is_selected: false })
    .eq("entry_id", entryId)
    .eq("is_selected", true);
  if (unsel) return { ok: false, error: unsel.message };

  const { error: sel } = await companyOs.from("marketing_asset_images").update({ is_selected: true })
    .eq("id", imageId);
  if (sel) return { ok: false, error: sel.message };

  const { error: mirror } = await companyOs.from("marketing_content").update({ image_url: url })
    .eq("id", entryId);
  if (mirror) return { ok: false, error: mirror.message };
  return { ok: true };
}

// Records a freshly produced image version and makes it the selected one.
export async function recordAssetImage(input: {
  entryId: string;
  url: string;
  promptUsed?: string | null;
  model?: string | null;
  createdBy?: string | null;
}): Promise<Result> {
  // Before the version history moves, so a refused image leaves the selection
  // and image_url agreeing: a live post on a gated campaign keeps its hero (Y.91).
  const live = await liveEditRefusal(input.entryId, { image_url: input.url });
  if (live) return { ok: false, error: live };
  const { error: unsel } = await companyOs.from("marketing_asset_images").update({ is_selected: false })
    .eq("entry_id", input.entryId)
    .eq("is_selected", true);
  if (unsel) return { ok: false, error: unsel.message };

  const { data, error: ins } = await companyOs.from("marketing_asset_images").insert({
      entry_id: input.entryId,
      url: input.url,
      prompt_used: input.promptUsed ?? null,
      model: input.model ?? null,
      is_selected: true,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .maybeSingle();
  if (ins) return { ok: false, error: ins.message };
  if (!data) return { ok: false, error: "Image version was not recorded." };

  const { error: mirror } = await companyOs.from("marketing_content").update({ image_url: input.url })
    .eq("id", input.entryId);
  if (mirror) return { ok: false, error: mirror.message };
  return { ok: true };
}

// Marks an existing version as the selected one (revert to an earlier image).
export async function setSelectedImage(
  entryId: string,
  imageId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("marketing_asset_images").select("url")
    .eq("id", imageId)
    .eq("entry_id", entryId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Image not found." };
  const url = (data as { url: string }).url;
  // Re-picking the selected image changes nothing and passes; another one on a
  // live post of a gated campaign is refused before the selection moves (Y.91).
  const live = await liveEditRefusal(entryId, { image_url: url });
  if (live) return { ok: false, error: live };

  const r = await selectAndMirror(entryId, imageId, url);
  if (!r.ok) return r;
  return { ok: true, url };
}
