import { companyOs } from "@/kernel/data/supabase";
import { one } from "@/kernel/config/embedded";
import type { RenderedBlocks } from "./marketing-email-blocks";
import type { BroadcastBlocks } from "./marketing-email-blocks";
import { siteForBrandSlug } from "@/entities/campaigns/lib/brand-sites";

// The featured posts as the email renders them: title, excerpt, hero and the
// live URL on the post's own brand site, read from marketing_content at send
// time so the email can never carry a stale copy. Ids that no longer resolve
// to a published post with a slug are dropped rather than sent as dead cards;
// a failed read sends the letter without cards. Order follows the blocks.

type Row = {
  id: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  slug: string | null;
  status: string;
  brands: { slug: string } | { slug: string }[] | null;
  marketing_pillars: { name: string } | { name: string }[] | null;
};

export async function resolveBroadcastBlocks(blocks: BroadcastBlocks): Promise<RenderedBlocks> {
  const cta = blocks.cta ?? null;
  const layout = blocks.layout;
  if (blocks.posts.length === 0) return { posts: [], cta, layout };
  const { data, error } = await companyOs.from("marketing_content").select("id, title, excerpt, image_url, slug, status, brands(slug), marketing_pillars(name)")
    .in("id", blocks.posts);
  if (error) {
    console.error("[broadcasts] resolving featured posts failed:", error.message);
    return { posts: [], cta, layout };
  }
  const byId = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, r]));
  const posts = blocks.posts.flatMap((id) => {
    const r = byId.get(id);
    if (!r || !r.slug || r.status !== "published") return [];
    const domain = siteForBrandSlug(one(r.brands)?.slug ?? null)?.domain ?? `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}`;
    return [{ title: r.title, excerpt: r.excerpt ?? "", imageUrl: r.image_url, url: `${domain}/post/${r.slug}/`, pillar: one(r.marketing_pillars)?.name ?? null }];
  });
  return { posts, cta, layout };
}
