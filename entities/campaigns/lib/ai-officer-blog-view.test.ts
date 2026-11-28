import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ai-officer.com reads public.ai_officer_blog_posts with the anon key, and the
// view runs with its owner's rights, so the migration's SQL is the only fence
// between the public internet and company_os.marketing_content. These tests
// read that SQL and hold it to what the migration's header promises.

const sql = readFileSync(
  new URL("../../../supabase/migrations/20261123150000_ai_officer_blog_posts_view.sql", import.meta.url),
  "utf8",
)
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

const view = sql.slice(sql.indexOf("create or replace view"), sql.indexOf(";") + 1);

// The columns a public blog page shows. Adding one is a decision about what
// anyone on the internet may read, so it changes this list on purpose.
const PUBLIC_COLUMNS = [
  "slug",
  "title",
  "title_tag",
  "meta_description",
  "excerpt",
  "image_url",
  "category",
  "read_time",
  "primary_keyword",
  "publish_date",
  "published_at",
  "updated_at",
  "copy_md",
  "body_html",
];

describe("public.ai_officer_blog_posts", () => {
  it("selects only the public columns of marketing_content", () => {
    const select = view.slice(view.indexOf("select") + "select".length, view.indexOf("from company_os.marketing_content"));
    const columns = select.split(",").map((c) => c.trim().replace(/^m\./, ""));
    expect(columns).toEqual(PUBLIC_COLUMNS);
  });

  it("returns only published blog rows of the AI Officer brand", () => {
    const where = view.slice(view.indexOf("where"));
    expect(where).toContain("b.slug = 'ai-officer'");
    expect(where).toContain("m.channel = 'blog'");
    expect(where).toContain("m.status = 'published'");
    // Every condition is joined by AND, so no OR can widen the fence.
    expect(where).not.toMatch(/\bor\b/);
  });

  it("reads from marketing_content and brands and nothing else", () => {
    const from = view.slice(view.indexOf("from"), view.indexOf("where"));
    expect(from.replace(/\s+/g, " ").trim()).toBe(
      "from company_os.marketing_content m join company_os.brands b on b.id = m.brand_id",
    );
  });

  it("grants anon SELECT and nothing more", () => {
    expect(sql).toContain("revoke all on public.ai_officer_blog_posts from public, anon, authenticated;");
    const grants = sql.match(/grant [^;]+ on public\.ai_officer_blog_posts[^;]*;/g) ?? [];
    expect(grants).toEqual(["grant select on public.ai_officer_blog_posts to anon, authenticated, service_role;"]);
  });
});
