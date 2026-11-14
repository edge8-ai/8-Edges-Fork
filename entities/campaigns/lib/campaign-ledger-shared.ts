// The campaign ledger: one row per campaign with the choices its posts made,
// the primary keyword, the primary question the post answers, the blog type,
// the hero image style and each social channel's style. The writer reads it
// before choosing, so a brand does not publish the same shape every week and
// two posts do not chase one keyword; the Log view on the Campaigns page shows
// the same rows to a person. This half has no database import so the browser
// view and the writer's checks can share it.

export type LedgerSocial = { channel: string; socialStyle: string | null; imageStyle: string | null };

export type LedgerRow = {
  campaignId: string;
  campaignName: string;
  brandId: string | null;
  brandName: string | null;
  // The blog's publish date, or the campaign start when the blog has none.
  date: string | null;
  status: string;
  blogStatus: string | null;
  slug: string | null;
  postedUrl: string | null;
  title: string | null;
  primaryKeyword: string | null;
  primaryQuestion: string | null;
  blogType: string | null;
  imageStyle: string | null;
  social: LedgerSocial[];
};

export type StyleDimension = "blogType" | "imageStyle" | "socialStyle";

// A style may carry at most two of a brand's last four posts in one dimension.
// Not a rotation: the model picks what fits the idea, and this only stops the
// same pick landing every time.
export const STYLE_WINDOW = 4;
export const STYLE_CEILING = 2;

function styleOf(row: LedgerRow, dimension: StyleDimension, channel?: string): string | null {
  if (dimension === "blogType") return row.blogType;
  if (dimension === "imageStyle") return row.imageStyle;
  return row.social.find((s) => s.channel === channel)?.socialStyle ?? null;
}

export function styleCeilingError(
  recent: LedgerRow[],
  dimension: StyleDimension,
  pick: string | null | undefined,
  channel?: string,
): string | null {
  if (!pick) return null;
  const window = recent.slice(0, STYLE_WINDOW);
  const used = window.filter((r) => styleOf(r, dimension, channel) === pick).length;
  if (used < STYLE_CEILING) return null;
  const what = dimension === "blogType" ? "blog type" : dimension === "imageStyle" ? "image style" : `${channel} style`;
  return `The ${what} "${pick}" already carries ${used} of the brand's last ${window.length} posts; choose one that fits this idea and has not been leaned on.`;
}

// The hero image never takes the same style as the brand's previous post, so
// consecutive posts on the blog index never look alike, on top of the ceiling.
export function repeatsLastError(recent: LedgerRow[], dimension: StyleDimension, pick: string | null | undefined): string | null {
  if (!pick || !recent.length || styleOf(recent[0], dimension) !== pick) return null;
  const what = dimension === "blogType" ? "blog type" : dimension === "imageStyle" ? "image style" : "style";
  return `The ${what} "${pick}" is the one the brand's last post used; choose a different one so consecutive posts do not look alike.`;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function keywordTakenError(recent: LedgerRow[], keyword: string | null | undefined): string | null {
  if (!keyword) return null;
  const hit = recent.find((r) => r.primaryKeyword && norm(r.primaryKeyword) === norm(keyword));
  if (!hit) return null;
  return `The primary keyword "${keyword}" is already the keyword of "${hit.campaignName}"${hit.slug ? ` (/post/${hit.slug}/)` : ""}; pick a keyword this post can own.`;
}

// The ledger as the writer reads it: one line per post, oldest last.
export function ledgerLines(rows: LedgerRow[]): string {
  if (!rows.length) return "(no earlier posts)";
  return rows
    .map((r) => {
      const social = r.social.filter((s) => s.socialStyle).map((s) => `${s.channel}=${s.socialStyle}`).join(" ");
      return [
        r.date ?? "undated",
        r.slug ? `/post/${r.slug}/` : r.campaignName,
        `keyword: ${r.primaryKeyword ?? "none"}`,
        `question: ${r.primaryQuestion ?? "none"}`,
        `blog: ${r.blogType ?? "none"}`,
        `image: ${r.imageStyle ?? "none"}`,
        social ? `social: ${social}` : null,
      ].filter(Boolean).join(" | ");
    })
    .join("\n");
}
