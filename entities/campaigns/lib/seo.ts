// Parse the loose, LLM-authored seo_md of a blog asset into the fields the
// publish action normalizes into real columns. seo_md format drifts (YAML-ish
// "primaryKeyword: x", markdown "**Primary keyword:** x", quoted or not), so
// matching is deliberately tolerant. This runs ONCE at publish time; rendering
// never touches seo_md.

export type ParsedSeo = {
  slug: string | null
  titleTag: string | null
  metaDescription: string | null
  primaryKeyword: string | null
  excerpt: string | null
  category: string | null
};

// Pull the value for a labelled field. Accepts `key: value`, `**key:** value`,
// `- key: value`, camelCase or spaced ("primaryKeyword" / "Primary keyword"),
// and strips surrounding quotes/markdown. Returns the first non-empty match.
function field(md: string, labels: string[]): string | null {
  for (const label of labels) {
    // Allow optional bold/list markers, the label (spaces optional), a : then value.
    const pattern = new RegExp(
      `^[\\s>*_-]*${label.replace(/\s+/g, "\\s*")}\\s*:\\*{0,2}\\s*(.+?)\\s*$`,
      "im",
    );
    const m = md.match(pattern);
    if (m) {
      const v = m[1]
        .replace(/^["'`]+|["'`]+$/g, "") // surrounding quotes
        .replace(/\*\*/g, "") // stray bold
        .trim();
      if (v && v !== "-") return v;
    }
  }
  return null;
}

export function parseSeoMd(seoMd: string | null): ParsedSeo {
  const md = seoMd ?? "";
  return {
    slug: normalizeSlug(field(md, ["slug", "url slug"])),
    titleTag: field(md, ["titleTag", "title tag", "title"]),
    metaDescription: field(md, ["metaDescription", "meta description", "meta"]),
    primaryKeyword: field(md, ["primaryKeyword", "primary keyword"]),
    excerpt: field(md, ["excerpt", "summary"]),
    category: field(md, ["category"]),
  };
}

// A slug value may arrive as "/my-post/" or "My Post"; reduce to kebab. Returns
// null if nothing usable remains (the publish action treats that as an error).
export function normalizeSlug(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || null;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}
