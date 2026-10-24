import type Anthropic from "@anthropic-ai/sdk";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import { parseSeoMd } from "@/entities/campaigns/lib/seo";
import { publishBlogAsset, validateBlogForPublish } from "@/entities/campaigns/lib/blog-publish";
import { siteForBrandSlug, blogPublishBlocker } from "@/entities/campaigns/lib/brand-sites";
import { getBrandProfile } from "@/entities/campaigns/lib/brand-profiles";
import { updateContentUnlessLive } from "@/entities/campaigns/lib/blog-live-edit";

// Runtime-agnostic tool layer for the Publish Editor agent. Every tool is bound
// to ONE asset at construction (no tool takes an assetId), so the agent cannot
// touch another asset. Executors run host-side (service-role stays server-side),
// identical whether the orchestrator is an in-app loop or a Managed Agent.

export type ToolResult = { content: string; isError?: boolean; chip?: string };

type Row = {
  id: string;
  channel: string;
  title: string;
  status: string;
  copy_md: string | null;
  seo_md: string | null;
  image_url: string | null;
  publish_date: string | null;
  posted_url: string | null;
  brand_id: string | null;
  brands: { name: string; slug: string } | { name: string; slug: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function wordCount(copyMd: string): number {
  const body = copyMd.split("## FAQ")[0];
  const t = body.replace(/<[^>]+>/g, " ").replace(/[#*`>_[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.split(" ").length : 0;
}

export const PUBLISH_EDITOR_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_blog_asset",
    description:
      "Read the blog asset under review: title, body, SEO plan, hero image, FAQ, brand, brand rules, word count, and whether the brand can publish. Call this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_validation_checks",
    description:
      "Run the same deterministic checks the publish step enforces (slug present+unique, title tag, meta description, image, >=600 words, FAQ present, no em dashes, brand can publish). Returns each check and whether the post is publishable.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_blog_content",
    description:
      "Edit the asset's body (copy_md, includes the <details class=\"faq-item\"> FAQ) and/or its SEO plan (seo_md, holds titleTag/metaDescription/primaryKeyword/slug/excerpt). Provide the full new text of whichever you change. Preserve the author's voice; make minimal edits. State a reason.",
    input_schema: {
      type: "object",
      properties: {
        copyMd: { type: "string", description: "Full new body markdown (only if changing it)." },
        seoMd: { type: "string", description: "Full new SEO plan markdown (only if changing it)." },
        reason: { type: "string", description: "Why this edit." },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "publish_blog_asset",
    description:
      "Publish the asset live: validates, sets it live on the brand's site, and verifies the URL. The only irreversible action. Refuses (returns errors) if validation fails. Idempotent if already published.",
    input_schema: {
      type: "object",
      properties: { confirm: { type: "boolean", description: "Must be true." } },
      required: ["confirm"],
      additionalProperties: false,
    },
  },
  {
    name: "check_live_url",
    description: "Fetch the asset's live URL and report the HTTP status and whether the title appears. Use for the final confirmation.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const CONTENT_SELECT =
  "id, channel, title, status, copy_md, seo_md, image_url, publish_date, posted_url, brand_id, brands(name, slug)";

// Factory: binds the tools to one asset + actor. Returns an exec(name, input).
export function makePublishEditorTools(assetId: string, actor: string) {
  async function load(): Promise<Row | null> {
    const { data, error: loadErr } = await companyOs.from("marketing_content").select(CONTENT_SELECT)
      .eq("id", assetId)
      .maybeSingle();
    if (loadErr) console.error("[company-os/campaigns] marketing_content", loadErr);
    return (data as Row) ?? null;
  }

  async function exec(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const row = await load();
    if (!row) return { content: "Asset not found.", isError: true };
    const brand = one(row.brands);
    const site = siteForBrandSlug(brand?.slug ?? null);
    const parsed = parseSeoMd(row.seo_md);

    switch (name) {
      case "get_blog_asset": {
        const copy = row.copy_md ?? "";
        const profile = row.brand_id ? await getBrandProfile(row.brand_id) : null;
        // Same-brand published posts: the internal-link targets the agent may
        // use (checklist requires >=2 in-body links to related posts).
        const { data: siblings, error: siblingsErr } = await companyOs.from("marketing_content").select("slug, title, brands!inner(slug)")
          .eq("channel", "blog")
          .eq("status", "published")
          .eq("brands.slug", brand?.slug ?? "")
          .not("slug", "is", null)
          .neq("id", assetId)
          .order("publish_date", { ascending: false })
          .limit(100);
        if (siblingsErr) console.error("[company-os/campaigns] marketing_content", siblingsErr);
        return {
          content: JSON.stringify({
            title: row.title,
            status: row.status,
            brandName: brand?.name ?? null,
            brandSlug: brand?.slug ?? null,
            siteDomain: site?.domain ?? null,
            publishBlocked: blogPublishBlocker(brand?.slug ?? null, brand?.name ?? "This brand"),
            heroImageUrl: row.image_url,
            wordCount: wordCount(copy),
            slug: parsed.slug,
            titleTag: parsed.titleTag,
            metaDescription: parsed.metaDescription,
            primaryKeyword: parsed.primaryKeyword,
            excerpt: parsed.excerpt,
            hasFaq: /<details[^>]*class="faq-item"/i.test(copy),
            brandRulesMd: profile?.rulesMd ?? null,
            internalLinkTargets: (siblings ?? []).map((s) => ({ slug: (s as { slug: string }).slug, title: (s as { title: string }).title })),
            bodyMd: copy,
            seoMd: row.seo_md,
          }),
          chip: "read asset",
        };
      }

      case "run_validation_checks": {
        const slugTaken = parsed.slug ? await isSlugTaken(parsed.slug, assetId) : false;
        const errors = validateBlogForPublish(row, parsed, (s) => slugTaken && s === parsed.slug);
        const blocker = blogPublishBlocker(brand?.slug ?? null, brand?.name ?? "This brand");
        if (blocker) errors.unshift(blocker);
        return {
          content: JSON.stringify({ publishable: errors.length === 0, failures: errors }),
          chip: "validate",
        };
      }

      case "update_blog_content": {
        const update: CompanyOsUpdate<"marketing_content"> = {};
        if (typeof input.copyMd === "string" && input.copyMd.trim()) update.copy_md = input.copyMd;
        if (typeof input.seoMd === "string" && input.seoMd.trim()) update.seo_md = input.seoMd;
        if (Object.keys(update).length === 0) {
          return { content: "No content provided to update.", isError: true };
        }
        // A live post on a gated campaign keeps its version (Y.91); the refusal
        // tells the agent, and through it the person, how to change it.
        const { error } = await updateContentUnlessLive(assetId, update);
        if (error) return { content: error.message, isError: true };
        await recordAudit({
          table: "marketing_content",
          recordId: assetId,
          operation: "update",
          actor: "publish-editor-agent",
          context: { onBehalfOf: actor, fields: Object.keys(update), reason: input.reason },
        });
        return { content: JSON.stringify({ ok: true, updated: Object.keys(update) }), chip: "edit content" };
      }

      case "publish_blog_asset": {
        if (input.confirm !== true) return { content: "confirm must be true.", isError: true };
        const r = await publishBlogAsset(assetId, `publish-editor-agent (on behalf of ${actor})`);
        return {
          content: JSON.stringify(r),
          isError: !r.ok,
          chip: r.ok ? "published" : "publish blocked",
        };
      }

      case "check_live_url": {
        if (!site) return { content: JSON.stringify({ ok: false, reason: "no site for brand" }) };
        const url = row.posted_url ?? (parsed.slug ? `${site.domain}/post/${parsed.slug}/` : null);
        if (!url) return { content: JSON.stringify({ ok: false, reason: "no slug yet" }) };
        try {
          const res = await fetch(url, { cache: "no-store", redirect: "follow" });
          const html = res.ok ? await res.text() : "";
          return {
            content: JSON.stringify({ url, status: res.status, ok: res.ok, titleFound: html.includes(row.title) }),
            chip: "verify url",
          };
        } catch (e) {
          return { content: JSON.stringify({ url, ok: false, error: String(e) }) };
        }
      }

      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  }

  return { tools: PUBLISH_EDITOR_TOOLS, exec };
}

async function isSlugTaken(slug: string, selfId: string): Promise<boolean> {
  const { data, error: slugErr } = await companyOs.from("marketing_content").select("id")
    .eq("channel", "blog")
    .eq("slug", slug)
    .neq("id", selfId)
    .maybeSingle();
  if (slugErr) console.error("[company-os/campaigns] marketing_content", slugErr);
  return Boolean(data);
}
