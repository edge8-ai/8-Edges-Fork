import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { liveEditRefusal, updateContentUnlessLive } from "@/entities/campaigns/lib/blog-live-edit";
import { systemPrompt } from "@/entities/campaigns/lib/ai/brand-writer";
import { ENTRY_COPY_PROMPT } from "@/entities/campaigns/lib/ai/brand-writer.prompt";
import { fillPrompt } from "@/kernel/ai/prompts";
import { blogTypeLabel, socialStyleLabel } from "@/entities/campaigns/lib/style-catalogues";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";

// Regenerates the copy for ONE calendar asset in its brand's voice, symmetric to
// generateEntryImage. Unlike writeForBrand (which drafts the whole channel set),
// this rewrites a single entry's copy_md and reads the entry's own fields as
// context. The brand voice is the fixed system prompt; the editable instruction
// is the user message, so the UI can show and tweak it before generating.

export const ENTRY_COPY_CLASS: AiDataClass = "A";
const AI = aiSite({ site: "entry-copy", dataClass: ENTRY_COPY_CLASS, tier: "standard" });
const MODEL = AI.model;

const CHANNEL_LABEL: Record<string, string> = {
  blog: "blog post",
  email: "marketing email",
  linkedin: "LinkedIn post",
  facebook: "Facebook post",
};

type EntryRow = {
  id: string;
  title: string;
  brand_id: string | null;
  channel: string;
  copy_md: string | null;
  notes: string | null;
  blog_style: string | null;
  social_style: string | null;
  asset_url: string | null;
  posted_url: string | null;
};

async function loadEntry(entryId: string): Promise<{ ok: true; entry: EntryRow } | { ok: false; error: string }> {
  const { data, error } = await companyOs.from("marketing_content").select("id, title, brand_id, channel, copy_md, notes, blog_style, social_style, asset_url, posted_url")
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Entry not found." };
  return { ok: true, entry: data as EntryRow };
}

function buildUserMessage(entry: EntryRow): string {
  const channel = CHANNEL_LABEL[entry.channel] ?? entry.channel;
  const style =
    entry.channel === "blog"
      ? blogTypeLabel(entry.blog_style)
      : entry.channel === "linkedin" || entry.channel === "facebook" || entry.channel === "twitter"
        ? socialStyleLabel(entry.social_style)
        : null;
  const source = entry.posted_url || entry.asset_url || null;

  const P = ENTRY_COPY_PROMPT.parts;
  const parts: string[] = [fillPrompt(P.write, { channel, title: entry.title })];
  if (style) parts.push(fillPrompt(P.style, { style }));
  if (entry.copy_md) parts.push(fillPrompt(P.draft, { draft: entry.copy_md }));
  if (entry.notes) parts.push(fillPrompt(P.notes, { notes: entry.notes }));
  if (source) parts.push(fillPrompt(P.reference, { url: source }));
  parts.push(fillPrompt(P.close, { channel }));
  return parts.join("\n\n");
}

// The detail page and blog preview render the title themselves, so a body that
// opens by repeating it as a heading shows the title twice. The prompt forbids
// it; this strips it when the model does it anyway.
function stripLeadingTitleHeading(md: string, title: string): string {
  const m = md.match(/^#{1,2}\s+(.+?)\s*\n+/);
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) return md.slice(m[0].length);
  return md;
}

// The editable instruction seed for the regenerate modal.
export async function buildEntryCopyPrompt(
  entryId: string,
): Promise<{ ok: true; prompt: string } | { ok: false; error: string }> {
  const r = await loadEntry(entryId);
  if (!r.ok) return r;
  if (!r.entry.brand_id) {
    return { ok: false, error: "Set a brand on this asset first, so the writer knows the voice." };
  }
  return { ok: true, prompt: buildUserMessage(r.entry) };
}

export const entryCopyOutput = z.object({
  body_md: z.string().describe("The copy in Markdown (headings, bold, lists, links). For email, exclude the unsubscribe footer; it is added automatically."),
});

const COPY_SCHEMA = jsonSchemaFor(entryCopyOutput);

export async function generateEntryCopy(
  entryId: string,
  opts?: { prompt?: string },
): Promise<{ ok: true; bodyMd: string } | { ok: false; error: string }> {
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };

    const r = await loadEntry(entryId);
    if (!r.ok) return r;
    const entry = r.entry;
    if (!entry.brand_id) {
      return { ok: false, error: "Set a brand on this asset first, so the writer knows the voice." };
    }
    const profile = await getBrandProfile(entry.brand_id);
    if (!profile) return { ok: false, error: "Brand not found." };
    // Asked before the model call, so a live post on a gated campaign (Y.91)
    // costs no draft; the write below asks again with the text it would save.
    const live = await liveEditRefusal(entryId);
    if (live) return { ok: false, error: live };

    const userMsg = opts?.prompt?.trim() || buildUserMessage(entry);

    // An operator-edited message still goes out under this prompt's version:
    // the version names the system text and the seed the edit started from.
    const response = await llm.messages.create({
      prompt: ENTRY_COPY_PROMPT,
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt(profile, ENTRY_COPY_PROMPT),
      output_config: { effort: "medium", format: { type: "json_schema", schema: COPY_SCHEMA } },
      messages: [{ role: "user", content: userMsg }],
    });

    const out = readStructuredOutput("entry-copy", MODEL, response, entryCopyOutput, "The model declined to draft this.");
    if (!out.ok) return { ok: false, error: out.error };

    const parsed = out.data;
    const bodyMd = stripLeadingTitleHeading((parsed.body_md ?? "").trim(), entry.title);
    if (!bodyMd) return { ok: false, error: "The writer produced nothing usable." };

    const { error } = await updateContentUnlessLive(entryId, { copy_md: bodyMd });
    if (error) return { ok: false, error: error.message };
    return { ok: true, bodyMd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[entry-copy] failed:", msg);
    return { ok: false, error: msg };
  }
}
