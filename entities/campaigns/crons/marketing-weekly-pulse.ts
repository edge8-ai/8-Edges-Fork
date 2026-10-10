import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { isoWeekKey, saigonToday } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";
import { failureOf, notify } from "@/kernel/messaging/router";
import { getAnalyticsOverview, getTrafficCount } from "@/entities/company-os";
import { getBroadcastStats } from "@/entities/campaigns/lib/broadcasts";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 23 * * 2";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Marketing weekly pulse",
  description: "Weekly, Monday. Posts a facts-only 'Marketing this week' to the Marketing Lark channel: public-site traffic with a week-over-week line, posts published, and the broadcasts that went out. No AI; the monthly recap owns content suggestions.",
  content: ["Vercel Analytics", "Marketing content", "Email campaigns"],
  apps: ["Vercel Analytics", "Supabase", "Lark"],
};

// Vercel cron (see vercel.json): weekly, Wednesday 06:00 Asia/Ho_Chi_Minh
// (Tue 23:00 UTC) — planning day, when our sprints turn over. Posts a plain "Marketing this
// week" pulse to the Marketing Lark channel — public-site traffic with a
// week-over-week line, what shipped (published posts), and the broadcasts that
// went out. Facts only, no AI: the pulse is a heartbeat. The monthly recap is
// where content suggestions live, because a single week is too thin to advise
// on. Always posts, even a quiet week, so its absence would be a real signal.

const DAY_MS = 86_400_000;
const CHANNEL_LABEL: Record<string, string> = { blog: "blog", linkedin: "LinkedIn", facebook: "Facebook", email: "email" };

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}

function wow(now: number, prior: number): string {
  if (prior <= 0) return "no prior week";
  const change = Math.round(((now - prior) / prior) * 100);
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "▬";
  return `${arrow} ${Math.abs(change)}% vs last week`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type PostRow = { channel: string };
type SentRow = { id: string; name: string };

async function handler(_req: Request) {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * DAY_MS);
  const priorStart = new Date(now.getTime() - 14 * DAY_MS);
  const rangeLabel = `${dayLabel(weekStart)} – ${dayLabel(now)}`;

  // Traffic: this week's overview (totals + top pages + channels) plus a prior
  // week count for the WoW line. Each degrades independently.
  const [overview, priorTraffic] = await Promise.all([
    getAnalyticsOverview("7d", "public"),
    getTrafficCount(priorStart.toISOString(), weekStart.toISOString(), "public"),
  ]);

  const failures: { subject: string; step: string; error: string }[] = [];
  const trafficLines: string[] = [];
  if ("error" in overview) {
    // The post says "unavailable"; the run says why, so a missing token is not
    // a quiet week of no traffic (Y.20).
    failures.push({ subject: "public-site traffic", step: "read", error: overview.error });
    trafficLines.push("Traffic · public site (7d): unavailable");
  } else {
    const { totals, topPages, byChannel } = overview;
    const wowLine = priorTraffic ? ` (${wow(totals.pageviews, priorTraffic.pageviews)})` : "";
    trafficLines.push("Traffic · public site (7d)");
    trafficLines.push(`Page views ${totals.pageviews.toLocaleString()}${wowLine} · Visitors ${totals.visitors.toLocaleString()}`);
    if (topPages.length > 0) {
      trafficLines.push("Top pages: " + topPages.slice(0, 3).map((p) => `${p.label} (${p.pageviews.toLocaleString()})`).join(" · "));
    }
    if (byChannel.length > 0) {
      trafficLines.push("Channels: " + byChannel.slice(0, 4).map((c) => `${c.label} ${c.value.toLocaleString()}`).join(" · "));
    }
  }

  // Shipped: content published this week (email ships as a broadcast, counted
  // below, so it is excluded here) and the broadcasts that went out.
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const [{ data: posts, error: postsError }, { data: sent, error: sentError }] = await Promise.all([
    companyOs.from("marketing_content").select("channel")
      .eq("status", "published")
      .neq("channel", "email")
      .gte("publish_date", weekStartDate),
    companyOs.from("email_campaigns").select("id, name")
      .eq("status", "sent")
      .gte("sent_at", weekStart.toISOString())
      .order("sent_at", { ascending: true }),
  ]);
  // A failed read leaves its line at zero in the post, which reads as a quiet
  // week, so each is named in the run as well as logged.
  if (postsError) {
    console.error("[marketing-weekly-pulse] posts read:", postsError.message);
    failures.push({ subject: "published posts", step: "read", error: postsError.message });
  }
  if (sentError) {
    console.error("[marketing-weekly-pulse] broadcasts read:", sentError.message);
    failures.push({ subject: "sent broadcasts", step: "read", error: sentError.message });
  }

  const postRows = (posts ?? []) as PostRow[];
  const byChannelCount = new Map<string, number>();
  for (const p of postRows) byChannelCount.set(p.channel, (byChannelCount.get(p.channel) ?? 0) + 1);
  const postBreakdown = [...byChannelCount.entries()].map(([c, n]) => `${n} ${CHANNEL_LABEL[c] ?? c}`).join(", ");

  const sentRows = (sent ?? []) as SentRow[];
  const emailLines: string[] = [];
  for (const b of sentRows) {
    const stats = await getBroadcastStats(b.id);
    emailLines.push(
      `• ${b.name} (${stats.sent} sent · Open ${pct(stats.opened, stats.delivered)} · Click ${pct(stats.clicked, stats.delivered)})`,
    );
  }

  const lines = [
    `📣 Marketing this week — ${rangeLabel}`,
    "",
    ...trafficLines,
    "",
    "Shipped this week",
    `Posts: ${postRows.length} published${postBreakdown ? ` (${postBreakdown})` : ""}`,
    sentRows.length === 0 ? "Emails: none sent" : `Emails: ${sentRows.length} broadcast${sentRows.length === 1 ? "" : "s"}`,
    ...emailLines,
    "",
    `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/team/revenue/marketing`,
  ];
  // At most once a week (Z.1): a run retried after an error further down
  // would otherwise post the week's pulse to the chat a second time. The
  // router claims the same key the ledger has always used, and since it runs
  // at 06:00 Saigon time the pulse is held to 08:30 the same Wednesday (Z.7).
  const posted = await notify({
    kind: "revenue.weekly-pulse",
    to: { chat: "revenue" },
    message: lines.join("\n"),
    dedupeKey: `campaigns:marketing-pulse:${isoWeekKey(saigonToday())}`,
  });
  failures.push(...failureOf(posted, "Marketing chat", "notify"));

  return routineResult({
    status: "ok",
    range: rangeLabel,
    pageviews: "error" in overview ? null : overview.totals.pageviews,
    postsPublished: postRows.length,
    broadcastsSent: sentRows.length,
    failures,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/marketing-weekly-pulse/", req, handler);
