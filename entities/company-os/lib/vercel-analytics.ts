import { VERCEL_ANALYTICS_PROJECT } from "@/entities/company-os/lib/vercel-analytics-project";

const API_BASE = "https://api.vercel.com/v1/query/web-analytics";
// Web Analytics was enabled on 2026-07-11 — there's no data before this date.
const TRACKING_START = "2026-07-11T00:00:00.000Z";
const TOP_N = 8;
// Vercel ranks the top-N by VISITORS, but these charts plot pageviews. Asking
// for a wider slice and re-ranking locally means the rows shown are actually the
// top rows by the number printed next to them. Before this, /team (221 views)
// rendered below /workflows (156) because /workflows had more visitors.
const TOP_FETCH = 40;
// Hard ceiling on any single Vercel Analytics call so a slow/hung upstream can
// never gate a page render. The dashboard streams these tiles behind Suspense,
// so on timeout the tile just shows "—" while the rest of the page is unaffected.
const ANALYTICS_TIMEOUT_MS = 3500;

type CountResponse = { data: { pageviews: number; visitors: number } };
type AggregateRow = { timestamp?: string; pageviews: number; visitors: number } & Record<string, unknown>;
type AggregateResponse = { data: AggregateRow[] };

export type AnalyticsBar = { label: string; value: number };

// A path or referrer with both metrics kept, so a view can rank by pageviews
// (volume) or by visitors (reach) without a second API call. Internal app usage
// cares about visitors: "how many people opened this page" is the adoption
// question, and one person refreshing a board all day is not ten people.
export type AnalyticsRow = { label: string; pageviews: number; visitors: number };

// Time windows offered on the Analytics page. "all" reaches back to when Web
// Analytics was enabled; the rolling windows count back from now.
export type AnalyticsRange = "all" | "7d" | "30d" | "90d";

// Which half of the site to report on.
//
// "internal" is Company OS: the admin, the team portal, and the client portal,
// all of which sit behind a login. "public" is everything else, which is the
// marketing site. Splitting them matters because they answer different
// questions and mixing them flatters one and buries the other: internal was
// 51% of pageviews in the last 30 days, so counting it as "site traffic" on a
// marketing page overstated audience by half.
export type AnalyticsSegment = "all" | "public" | "internal";

const INTERNAL_PREFIXES = ["/admin", "/team", "/portal"] as const;

const ROLLING_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90 };

// The Vercel Web Analytics `by: day` aggregate rejects windows longer than 62
// days ("Can only query up to 62 days"). Totals and top-N (by requestPath /
// referrerHostname) allow up to 366 days, so only the daily series is clamped —
// 61 days back yields 62 buckets, the confirmed ceiling.
const MAX_DAILY_DAYS = 61;

export type AnalyticsOverview = {
  totals: { pageviews: number; visitors: number };
  daily: AnalyticsBar[];
  topPages: AnalyticsRow[];
  topReferrers: AnalyticsRow[];
  // Referrer pageviews rolled up by channel (Direct / Social / Search / …), for
  // the "Traffic by channel" strip. Empty channels are omitted.
  byChannel: AnalyticsBar[];
  // Pageviews represented by the rows above, against the segment total. The
  // API's "Others" remainder is dropped rather than charted (it was 76% of the
  // bar chart and squashed every real page), so this is how the page can still
  // say honestly how much of the traffic the list covers.
  coverage: { shownPageviews: number; totalPageviews: number };
};

export type AnalyticsResult = AnalyticsOverview | { error: string };

// Start of the requested window, never earlier than when tracking began — there
// is no data before TRACKING_START, so a wider rolling window just clamps to it.
function sinceFor(range: AnalyticsRange): string {
  if (range === "all") return TRACKING_START;
  const rollingStart = Date.now() - ROLLING_DAYS[range] * 24 * 60 * 60 * 1000;
  return new Date(Math.max(rollingStart, Date.parse(TRACKING_START))).toISOString();
}

// The API takes an OData filter. startswith() is supported, which is what makes
// a real split possible: unique visitors CANNOT be summed across per-path rows
// (one person visiting /admin and /team is one visitor, two rows), so the only
// correct way to count people in a segment is to ask the API with the segment
// as a filter.
export function segmentFilter(segment: AnalyticsSegment): string {
  const base = "environment eq 'production'";
  if (segment === "all") return base;
  const paths = INTERNAL_PREFIXES.map((p) => `startswith(requestPath,'${p}')`).join(" or ");
  return segment === "internal" ? `${base} and (${paths})` : `${base} and not (${paths})`;
}

export function isInternalPath(path: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function buildUrl(path: string, params: Record<string, string>) {
  // Both exported readers check for a project before querying; this throw is
  // only reachable if a new caller forgets to.
  if (!VERCEL_ANALYTICS_PROJECT) throw new Error("No Vercel Analytics project is configured.");
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("teamId", VERCEL_ANALYTICS_PROJECT.teamId);
  url.searchParams.set("projectId", VERCEL_ANALYTICS_PROJECT.projectId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function query<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(ANALYTICS_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Vercel Web Analytics API (${path}) returned ${res.status}`);
  }
  return res.json();
}

function formatDay(timestamp?: string) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "Others" is not a page. It is the remainder bucket the API appends when a
// limit is applied, holding every row outside the top-N, and it is routinely
// larger than every real row combined. Charting it tells you nothing and hides
// everything else, so it is dropped and accounted for via `coverage` instead.
const REMAINDER_LABEL = "Others";

function toRows(rows: AggregateRow[], key: string, fallbackLabel: string): AnalyticsRow[] {
  return rows
    .filter((row) => row[key] !== REMAINDER_LABEL)
    .map((row) => ({
      label: (row[key] as string) || fallbackLabel,
      pageviews: row.pageviews,
      visitors: row.visitors,
    }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, TOP_N);
}

export function toBars(rows: AnalyticsRow[], metric: "pageviews" | "visitors" = "pageviews"): AnalyticsBar[] {
  return rows.map((row) => ({ label: row.label, value: row[metric] }));
}

// ----------------------------------------------------------- traffic channels

// The marketing question "where is our traffic coming from" answered at the
// grouping people think in, not raw hostnames. Social is the one this exists to
// surface: it rolls up every network's referrer host into one number.
export type Channel = "Direct" | "Social" | "Search" | "Email" | "Referral";

// Bare (www-stripped) hostnames. Extend as new networks show up in the referrer
// list. Anything unmatched is a plain Referral, so a miss under-reports a
// specific channel rather than vanishing.
const SOCIAL_HOSTS = new Set([
  "linkedin.com", "lnkd.in",
  "facebook.com", "l.facebook.com", "m.facebook.com", "lm.facebook.com", "fb.me",
  "t.co", "twitter.com", "x.com",
  "instagram.com", "l.instagram.com",
  "youtube.com", "m.youtube.com", "youtu.be",
  "reddit.com", "out.reddit.com",
  "threads.net", "tiktok.com", "pinterest.com",
]);
const SEARCH_HOSTS = new Set([
  "google.com", "bing.com", "duckduckgo.com", "search.brave.com",
  "ecosia.org", "baidu.com", "yandex.com", "search.yahoo.com",
]);
// Webmail referrers: a click from an email opened in the browser. Precise email
// attribution needs UTM tags (a follow-up); this catches the common webmail
// hosts so those clicks are not mislabelled as generic referrals.
const EMAIL_HOSTS = new Set([
  "mail.google.com", "outlook.live.com", "outlook.office365.com", "outlook.office.com", "mail.yahoo.com",
]);

export function channelFor(hostname: string | null | undefined): Channel {
  const bare = (hostname ?? "").trim().toLowerCase().replace(/^www\./, "");
  if (!bare) return "Direct";
  // Email before the google catch-all: mail.google.com is a webmail click, not
  // a search visit.
  if (EMAIL_HOSTS.has(bare)) return "Email";
  if (SOCIAL_HOSTS.has(bare)) return "Social";
  if (SEARCH_HOSTS.has(bare) || bare.endsWith(".google.com") || bare.endsWith(".bing.com")) return "Search";
  return "Referral";
}

// Pageviews summed per channel across the referrer rows. Pageviews are additive,
// so this total is honest; visitors are NOT summable across rows (one person on
// two referrers is two rows, one visitor), so this deliberately uses pageviews.
// The "Others" remainder is not a hostname and is skipped, so a long tail of
// tiny referrers is uncounted here — the number is a floor, which the UI says.
function channelTotals(rows: AggregateRow[]): AnalyticsBar[] {
  const totals = new Map<Channel, number>();
  for (const row of rows) {
    const host = row.referrerHostname as string | undefined;
    if (host === REMAINDER_LABEL) continue;
    const ch = channelFor(host);
    totals.set(ch, (totals.get(ch) ?? 0) + row.pageviews);
  }
  const order: Channel[] = ["Direct", "Social", "Search", "Referral", "Email"];
  return order.map((label) => ({ label, value: totals.get(label) ?? 0 })).filter((b) => b.value > 0);
}

// Pageviews and visitors for an explicit [since, until) window on one segment.
// getAnalyticsOverview only counts rolling-from-now windows; the weekly pulse
// needs an arbitrary prior week for its week-over-week line, so this exposes the
// raw count against a fixed window. Returns null (never throws) when the token
// is missing or the API is slow, so the pulse degrades to "traffic unavailable".
export async function getTrafficCount(
  since: string,
  until: string,
  segment: AnalyticsSegment = "public",
): Promise<{ pageviews: number; visitors: number } | null> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token || !VERCEL_ANALYTICS_PROJECT) return null;
  try {
    const count = await query<CountResponse>("visits/count", { since, until, filter: segmentFilter(segment) }, token);
    return count.data;
  } catch {
    return null;
  }
}

export async function getAnalyticsOverview(
  range: AnalyticsRange = "all",
  segment: AnalyticsSegment = "all",
): Promise<AnalyticsResult> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) {
    return { error: "VERCEL_ANALYTICS_TOKEN is not set. Add it as a project environment variable to enable this page." };
  }
  if (!VERCEL_ANALYTICS_PROJECT) {
    return { error: "No Vercel project is configured for analytics. Set VERCEL_ANALYTICS_TEAM_ID and VERCEL_ANALYTICS_PROJECT_ID to enable this page." };
  }

  const sinceStr = sinceFor(range);
  // Daily series is capped at the API's 62-day ceiling; the other three queries
  // run the full window. For 7d/30d this equals sinceStr; only 90d/all-time clamp.
  const dailySince = new Date(
    Math.max(Date.parse(sinceStr), Date.now() - MAX_DAILY_DAYS * 24 * 60 * 60 * 1000),
  ).toISOString();
  const untilStr = new Date().toISOString();
  const filter = segmentFilter(segment);

  try {
    const [count, daily, pages, referrers] = await Promise.all([
      query<CountResponse>("visits/count", { since: sinceStr, until: untilStr, filter }, token),
      query<AggregateResponse>(
        "visits/aggregate",
        { since: dailySince, until: untilStr, by: "day", filter },
        token,
      ),
      query<AggregateResponse>(
        "visits/aggregate",
        { since: sinceStr, until: untilStr, by: "requestPath", limit: String(TOP_FETCH), filter },
        token,
      ),
      query<AggregateResponse>(
        "visits/aggregate",
        { since: sinceStr, until: untilStr, by: "referrerHostname", limit: String(TOP_FETCH), filter },
        token,
      ),
    ]);

    const topPages = toRows(pages.data, "requestPath", "(unknown)");
    const topReferrers = toRows(referrers.data, "referrerHostname", "Direct");
    const byChannel = channelTotals(referrers.data);

    return {
      totals: count.data,
      daily: daily.data.map((row) => ({ label: formatDay(row.timestamp), value: row.pageviews })),
      topPages,
      topReferrers,
      byChannel,
      coverage: {
        shownPageviews: topPages.reduce((sum, row) => sum + row.pageviews, 0),
        totalPageviews: count.data.pageviews,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load Vercel Analytics data." };
  }
}
