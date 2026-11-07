import { supabase, companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { recordAssetImage } from "@/entities/campaigns/lib/marketing-images";
import { liveEditRefusal } from "@/entities/campaigns/lib/blog-live-edit";
import { imageStyleLabel } from "@/entities/campaigns/lib/style-catalogues";
import { httpErrorKind, otherProviderCall } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import { BRAND_IMAGE_PROMPT } from "./brand-image.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";

// Generates one image for a calendar entry from its image brief + chosen image
// style + the brand's image guidance, using Google's Gemini image model, and
// stores it as a kept version in the public `marketing` bucket. Same contract as
// the writer: never throws, no-ops without a key. Model is env-overridable
// because these names move.

const MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

// A marketing image is published output: class A, the one class (with B) a
// provider without a zero-retention route may carry.
export const BRAND_IMAGE_CLASS: AiDataClass = "A";

// The aspect ratios Gemini's imageConfig accepts. Heroes default to 16:9: the
// post page shows the cover inside a 520px-tall crop, and a square image loses
// its top and bottom there (the Fable 5.1 post shipped that way).
export type ImageAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
export const HERO_ASPECT_RATIO: ImageAspectRatio = "16:9";

type Result = { ok: true; url: string } | { ok: false; error: string };

type GeminiPart = { inlineData?: { mimeType?: string; data?: string } };
type GeminiReply = { ok: true; part: GeminiPart | undefined } | { ok: false; error: string };

// The image model paints hex codes as text about half the time, however firmly
// the prompt says not to. Brand guidance and briefs name their colours before
// the code ("Navy #04102D"), so dropping the codes keeps the meaning and
// removes the only strings the model reliably renders as writing.
export function withoutHexCodes(text: string | null): string | null {
  if (!text) return text;
  return text
    .replace(/\s*#[0-9a-fA-F]{6}\b/g, "")
    .replace(/\s*#[0-9a-fA-F]{3}\b/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function buildPrompt(
  title: string,
  rawBrief: string | null,
  styleLabel: string | null,
  rawGuidance: string | null,
  aspectRatio: ImageAspectRatio,
): string {
  const brief = withoutHexCodes(rawBrief);
  const brandGuidance = withoutHexCodes(rawGuidance);
  const P = BRAND_IMAGE_PROMPT;
  return fillPrompt(P.user, {
    title,
    style: styleLabel || P.parts.defaultStyle,
    guidance: brandGuidance || P.parts.noGuidance,
    brief: brief || P.parts.noBrief,
    aspectRatio,
  });
}

type ImageInputs = { title: string; brief: string | null; styleLabel: string | null; brandGuidance: string | null };

async function loadImageInputs(entryId: string): Promise<{ ok: true; inputs: ImageInputs } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("marketing_content").select("id, title, brand_id, image_brief_md, image_style")
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Entry not found." };

  const entry = data as {
    id: string;
    title: string;
    brand_id: string | null;
    image_brief_md: string | null;
    image_style: string | null;
  };
  const profile = entry.brand_id ? await getBrandProfile(entry.brand_id) : null;
  return {
    ok: true,
    inputs: {
      title: entry.title,
      brief: entry.image_brief_md,
      styleLabel: imageStyleLabel(entry.image_style),
      brandGuidance: profile?.imageStyleMd ?? null,
    },
  };
}

// The assembled prompt for an entry's image, so the UI can show and edit it
// before generating. The exact string returned is what generateEntryImage sends
// when passed back as opts.prompt.
export async function buildEntryImagePrompt(
  entryId: string,
  aspectRatio: ImageAspectRatio = HERO_ASPECT_RATIO,
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  const r = await loadImageInputs(entryId);
  if (!r.ok) return r;
  const { title, brief, styleLabel, brandGuidance } = r.inputs;
  return { ok: true, prompt: buildPrompt(title, brief, styleLabel, brandGuidance, aspectRatio) };
}

export async function generateEntryImage(
  entryId: string,
  opts?: { createdBy?: string | null; prompt?: string; aspectRatio?: ImageAspectRatio },
): Promise<Result> {
  try {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) return { ok: false, error: "GEMINI_API_KEY is not configured." };

    // Asked before the model call, so a live post on a gated campaign (Y.91)
    // costs no image; recordAssetImage asks again before it selects one.
    const live = await liveEditRefusal(entryId);
    if (live) return { ok: false, error: live };

    const aspectRatio = opts?.aspectRatio ?? HERO_ASPECT_RATIO;

    // Use the caller's edited prompt verbatim when provided; otherwise assemble
    // it from the entry.
    let prompt = opts?.prompt?.trim() || "";
    if (!prompt) {
      const r = await loadImageInputs(entryId);
      if (!r.ok) return { ok: false, error: r.error };
      const { title, brief, styleLabel, brandGuidance } = r.inputs;
      prompt = buildPrompt(title, brief, styleLabel, brandGuidance, aspectRatio);
    }

    const contents = [{ parts: [{ text: prompt }] }];
    // An operator-edited prompt still goes out under this prompt's version:
    // the version names the template the edit started from.
    const reply = await otherProviderCall<GeminiReply>(
      { site: "brand-image", dataClass: BRAND_IMAGE_CLASS, provider: "google", model: MODEL, prompt: BRAND_IMAGE_PROMPT, input: contents },
      async () => {
        // The key rides in the x-goog-api-key header: in the query string it
        // lands in every request log between here and Google.
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents,
            // The ratio goes in the request, not the prompt: the model treats a
            // ratio in prose as a suggestion and returned squares for "16:9".
            generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } },
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          return {
            value: { ok: false, error: `Image API error ${res.status}: ${body.slice(0, 200)}` },
            usage: null,
            ok: false,
            errorKind: httpErrorKind(res.status),
          };
        }
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: GeminiPart[] } }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const usage = json.usageMetadata
          ? { input_tokens: json.usageMetadata.promptTokenCount ?? 0, output_tokens: json.usageMetadata.candidatesTokenCount ?? 0 }
          : null;
        const found = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        return { value: { ok: true, part: found }, usage, ok: Boolean(found?.inlineData?.data) };
      },
    );
    if (!reply.ok) return reply;
    const part = reply.part;
    if (!part?.inlineData?.data) return { ok: false, error: "The model returned no image." };

    const mime = part.inlineData.mimeType || "image/png";
    const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
    const buffer = Buffer.from(part.inlineData.data, "base64");
    const path = `entries/${entryId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("marketing")
      .upload(path, buffer, { contentType: mime, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    const { data: pub } = supabase.storage.from("marketing").getPublicUrl(path);

    // Keep the version, don't overwrite: record a selected image row (with the
    // exact prompt that made it) which also mirrors image_url on the entry.
    const rec = await recordAssetImage({
      entryId,
      url: pub.publicUrl,
      promptUsed: prompt,
      model: MODEL,
      createdBy: opts?.createdBy ?? null,
    });
    if (!rec.ok) return { ok: false, error: rec.error };

    return { ok: true, url: pub.publicUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[brand-image] failed:", msg);
    return { ok: false, error: msg };
  }
}
