import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { BarChart } from "@/kernel/ui/charts/BarChart";
import {
  getAnalyticsOverview,
  isInternalPath,
  toBars,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "@/entities/company-os/lib/vercel-analytics";
import { firstParam, mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";

const VERCEL_ANALYTICS_URL = "https://vercel.com/edge8-ais-projects/edge8-web/analytics";

const RANGES: { key: AnalyticsRange; label: string; sub: string }[] = [
  { key: "7d", label: "Last 7 days", sub: "rolling 7 days" },
  { key: "30d", label: "Last 30 days", sub: "rolling 30 days" },
  { key: "90d", label: "Last 90 days", sub: "rolling 90 days" },
  { key: "all", label: "All time", sub: "since Jul 11, 2026" },
];

// Public is the marketing site; internal is Company OS behind a login. They
// answer different questions, so the page reports one at a time rather than
// blending them into a single misleading "site traffic" number.
const SEGMENTS: { key: AnalyticsSegment; label: string; blurb: string }[] = [
  { key: "all", label: "Everything", blurb: "the marketing site and Company OS combined" },
  { key: "public", label: "Public site", blurb: "the marketing site only, excluding Company OS" },
  { key: "internal", label: "Company OS", blurb: "admin, team, and client portal usage" },
];

function parseRange(value: string | undefined): AnalyticsRange {
  return value === "7d" || value === "30d" || value === "90d" ? value : "all";
}

function parseSegment(value: string | undefined): AnalyticsSegment {
  return value === "public" || value === "internal" ? value : "all";
}

// Company OS paths are deep and repetitive, so the raw path is a poor label.
// "/admin/talent/applications" reads better as "Talent · Applications", which
// is also how the nav names it.
function prettyPath(path: string): string {
  if (path === "/") return "Home";
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return path;
  return parts
    .map((part) =>
      part
        .replace(/^\[.*\]$/, "detail")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .join(" · ");
}

export default async function AnalyticsPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.operations");
  const searchParams = await props.searchParams;
  const range = parseRange(firstParam(searchParams.range));
  const segment = parseSegment(firstParam(searchParams.segment));
  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const activeSegment = SEGMENTS.find((s) => s.key === segment) ?? SEGMENTS[0];
  const overview = await getAnalyticsOverview(range, segment);

  const isInternal = segment === "internal";
  // Adoption is a people question, so Company OS ranks pages by unique users.
  // The public site is a reach question, so it ranks by page views.
  const pageMetric = isInternal ? "visitors" : "pageviews";

  return (
    <div>
      <PageHead
        eyebrow="Operations"
        title="Analytics"
        sub={`${activeSegment.blurb}, ${activeRange.sub}.`}
        action={
          <a href={VERCEL_ANALYTICS_URL} target="_blank" rel="noopener noreferrer" className="admin-btn">
            Open in Vercel ↗
          </a>
        }
      />

      <div className="u-row u-gap-3 u-wrap u-mb-4">
        <div className="admin-viewtoggle" role="group" aria-label="Traffic segment">
          {SEGMENTS.map((s) => (
            <Link
              key={s.key}
              href={`/admin/operations/analytics${mergeQuery(searchParams, { segment: s.key === "all" ? null : s.key })}`}
              className={s.key === segment ? "is-active" : ""}
              aria-current={s.key === segment ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="admin-tabs u-mb-0" role="tablist">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/admin/operations/analytics${mergeQuery(searchParams, { range: r.key === "all" ? null : r.key })}`}
              role="tab"
              aria-selected={r.key === range}
              className={`admin-tab${r.key === range ? " is-active" : ""} u-link-plain`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {"error" in overview ? (
        <div className="admin-alert admin-alert--err">{overview.error}</div>
      ) : (
        <div className="admin-summary">
          <div className="admin-summary-pills">
            <div className="admin-pill">
              <span className="admin-pill-label">{isInternal ? "Unique users" : "Visitors"}</span>
              <span className="admin-pill-val">{overview.totals.visitors.toLocaleString()}</span>
            </div>
            <div className="admin-pill">
              <span className="admin-pill-label">Page views</span>
              <span className="admin-pill-val">{overview.totals.pageviews.toLocaleString()}</span>
            </div>
            <div className="admin-pill">
              <span className="admin-pill-label">Views per user</span>
              <span className="admin-pill-val">
                {overview.totals.visitors > 0
                  ? (overview.totals.pageviews / overview.totals.visitors).toFixed(1)
                  : "—"}
              </span>
            </div>
          </div>

          {isInternal && (
            <p className="admin-hint u-mt-n1">
              Vercel counts browsers, not verified logins: the same person on a phone and a laptop,
              or across a long window, can count more than once. Read these as usage of each screen
              rather than a headcount.
            </p>
          )}

          <div className="admin-summary-grid u-grid-2">
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">Daily page views</div>
              <BarChart data={overview.daily} ariaLabel="Daily page views" />
            </div>
            <div className="admin-card admin-chart-card">
              <div className="admin-kpi-label">Top referrers</div>
              <BarChart
                data={toBars(overview.topReferrers)}
                ariaLabel="Top referrers by page views"
                emptyText={isInternal ? "Company OS is reached directly." : "No referrer data yet."}
              />
            </div>
          </div>

          <div className="admin-card admin-section-card">
            <div className="admin-card-title">
              {isInternal ? "Most used screens" : "Top pages"}
            </div>
            <p className="admin-page-sub u-mt-1">
              {isInternal
                ? "Ranked by how many people opened each screen, not how often. Adoption is a people question."
                : "Ranked by page views."}{" "}
              These {overview.topPages.length} rows cover{" "}
              {overview.coverage.totalPageviews > 0
                ? Math.round((overview.coverage.shownPageviews / overview.coverage.totalPageviews) * 100)
                : 0}
              % of {overview.coverage.totalPageviews.toLocaleString()} page views in this window.
            </p>
            <div className="admin-table-wrap u-mt-3">
              {overview.topPages.length === 0 ? (
                <div className="admin-empty">No page data in this window.</div>
              ) : (
                <div className="admin-table-scroll">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{isInternal ? "Screen" : "Page"}</th>
                        <th className="u-right">Unique users</th>
                        <th className="u-right">Page views</th>
                        <th className="u-right">Views each</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...overview.topPages]
                        .sort((a, b) => b[pageMetric] - a[pageMetric])
                        .map((row) => (
                          <tr key={row.label}>
                            <td className="admin-cell-strong">
                              {isInternal ? prettyPath(row.label) : row.label}
                              {isInternal && (
                                <div className="admin-cell-muted u-sm">
                                  {row.label}
                                </div>
                              )}
                            </td>
                            <td className="admin-cell-mono u-right">
                              {row.visitors.toLocaleString()}
                            </td>
                            <td className="admin-cell-mono u-right">
                              {row.pageviews.toLocaleString()}
                            </td>
                            <td className="admin-cell-mono u-right">
                              {row.visitors > 0 ? (row.pageviews / row.visitors).toFixed(1) : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="admin-card admin-chart-card">
            <div className="admin-kpi-label">
              {isInternal ? "Screens by unique users" : "Pages by page views"}
            </div>
            <BarChart
              data={toBars(
                isInternal
                  ? overview.topPages.map((row) => ({ ...row, label: prettyPath(row.label) }))
                  : overview.topPages,
                pageMetric,
              )}
              ariaLabel={isInternal ? "Screens by unique users" : "Pages by page views"}
              stacked
            />
          </div>
        </div>
      )}
    </div>
  );
}
