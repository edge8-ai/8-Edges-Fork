import { unstable_cache } from "next/cache";
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { type PostMeta } from "./postData";
import { SELF_BRAND_SLUG } from "@/kernel/config/brand";
import { one, type Embedded } from "@/kernel/config/embedded";
import { slugify } from "@/kernel/config/slug";

// The published blog posts, read from the marketing system
// (company_os.marketing_content). The blog pages themselves live in the marketing
// site's own repository; what reads the list here is the App (the Team Home's
// reading list). DB reads are tag-cached and degrade to [] on failure.

export const BLOG_CACHE_TAG = "blog-posts";
export const postTag = (slug: string) => `post:${slug}`;

export type PostSource = "static" | "db";
export type UnifiedPostMeta = PostMeta & { source: PostSource };

type DbListRow = {
  slug: string;
  title: string;
  publish_date: string | null;
  published_at: string | null;
  category: string | null;
  category_slug: string | null;
  image_url: string | null;
  read_time: string | null;
  excerpt: string | null;
  marketing_pillars: Embedded<{ name: string }>;
};

// marketing_pillars has no slug column; the URL slug is derived from the name
// with the one shared slugify, so the hub route and the post's pillar link
// always agree.
const LIST_COLUMNS =
  "slug, title, publish_date, published_at, category, category_slug, image_url, read_time, excerpt, marketing_pillars(name)";

function mapDbMeta(row: DbListRow): UnifiedPostMeta {
  const pillar = one(row.marketing_pillars)?.name ?? null;
  return {
    ...(pillar ? { pillar, pillarSlug: slugify(pillar) } : {}),
    source: "db",
    slug: row.slug,
    title: row.title,
    date: row.publish_date ?? (row.published_at ? row.published_at.slice(0, 10) : ""),
    category: row.category ?? "Innovation",
    categorySlug: row.category_slug ?? "innovation",
    image: row.image_url ?? "",
    readTime: row.read_time ?? "",
    tags: [],
    mdFile: "", // unused for DB posts; body comes from copy_md
    excerpt: row.excerpt ?? "",
  };
}

// All published posts, newest first (metadata only, no copy_md). The blog is
// now DB-only: every post, including the migrated legacy ones, lives in
// marketing_calendar. The list is tag-cached, and the try/catch → [] mirrors
// lib/jobs.getActiveJobs so a DB blip degrades to static-only rather than
// failing the page.
export const getAllPublishedPosts = unstable_cache(
  async (): Promise<UnifiedPostMeta[]> => {
    try {
      // brands!inner scopes rows to THIS site's brand — AIO (and any other
      // brand's) posts must never render on edge8.ai.
      const res = await companyOs.from("marketing_content").select(`${LIST_COLUMNS}, brands!inner(slug)`)
        .eq("channel", "blog")
        .eq("status", "published")
        .eq("brands.slug", SELF_BRAND_SLUG)
        .not("slug", "is", null)
        .order("publish_date", { ascending: false });
      // readOr, not a bare `?? []`: the empty list is a deliberate fallback (a
      // blip degrades the blog to its static posts rather than failing the
      // page, and this list feeds generateStaticParams), so the caller names it
      // here and the failure is still logged.
      const rows = readOr(res, "[campaigns/blog] published posts", [] as DbListRow[]);
      return (rows as DbListRow[]).map(mapDbMeta);
    } catch (e) {
      // Same deliberate fallback as readOr above, for a throw rather than a
      // PostgREST error, and logged for the same reason.
      console.error("[campaigns/blog] published posts threw", e);
      return [];
    }
  },
  ["db-blog-posts-list"],
  { tags: [BLOG_CACHE_TAG], revalidate: 3600 },
);
