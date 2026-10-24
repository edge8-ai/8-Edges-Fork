import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { failureOf, notify } from "@/kernel/messaging/router";
import { escapeHtml } from "@/kernel/config/html";
import { one } from "@/kernel/config/embedded";
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { saigonToday } from "@/kernel/config/dates";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 2 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Marketing digest",
  description: "Weekdays at 09:00 Vietnam time. Reminds the founder and the Revenue chat of manual-post content (blog, LinkedIn, Facebook) due today or overdue and not yet posted. Monday's reminder covers anything that fell due over the weekend.",
  content: ["Marketing calendar"],
  apps: ["Supabase", "Lark"],
};

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// Vercel cron (see vercel.json): weekdays, 02:00 UTC (09:00 Asia/Ho_Chi_Minh).
// Reminds the founder of manual-post content (blog, LinkedIn, Facebook) whose
// publish date fell in the last seven days and that is not yet posted. Email is
// excluded: it sends itself via the campaign engine. Sends nothing when nothing
// is due. It does not run at the weekend (Z.7.1): the reminder already lists
// everything due or overdue, so Monday's run covers what a Saturday or Sunday
// run would have said, and held weekend reminders cannot stack up on Monday.
const FOUNDER_EMAIL = OPS_EMAIL;
const CALENDAR_URL = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/team/revenue/marketing/calendar`;
const MANUAL_CHANNELS = ["blog", "linkedin", "facebook", "twitter"];
const CHANNEL_LABEL: Record<string, string> = {
  blog: "Blog",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

type DueRow = {
  id: string;
  title: string;
  channel: string;
  publish_date: string | null;
  brands: { name: string } | { name: string }[] | null;
};

function brandName(row: DueRow): string {
  const b = one(row.brands);
  return b?.name ?? "—";
}

async function handler(req: Request) {
  const today = saigonToday();
  // Only the last seven days of unposted content. Without a lower bound a post
  // that was never marked posted reappears in this email every day forever; a
  // week is long enough to still catch a real miss, short enough to age out
  // the stale ones the calendar has moved past.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await companyOs.from("marketing_content").select("id, title, channel, publish_date, brands(name)")
    .in("channel", MANUAL_CHANNELS)
    .gte("publish_date", weekAgo)
    .lte("publish_date", today)
    .not("status", "in", "(published,skipped)")
    .order("publish_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as DueRow[];
  if (rows.length === 0) {
    return routineResult({ status: "skipped", reason: "nothing is due to be posted", today, due: 0, sent: false });
  }

  const line = (r: DueRow) => {
    const overdue = r.publish_date && r.publish_date < today ? " (overdue)" : "";
    return `<li><strong>${escapeHtml(r.title)}</strong> — ${CHANNEL_LABEL[r.channel] ?? r.channel} · ${escapeHtml(
      brandName(r),
    )} · ${r.publish_date}${overdue}</li>`;
  };

  const html =
    `<p>Content due to be posted by hand (blog, LinkedIn, Facebook):</p>` +
    `<ul>${rows.map(line).join("")}</ul>` +
    `<p>Mark each one posted from the calendar once it's live.</p>` +
    `<p><a href="${CALENDAR_URL}">Open the marketing calendar</a></p>`;

  const emailOk = await sendTransactionalEmail({
    to: FOUNDER_EMAIL,
    subject: `Marketing: ${rows.length} post${rows.length === 1 ? "" : "s"} due`,
    html,
  });

  const larkLines = [
    `📣 Marketing — ${rows.length} post${rows.length === 1 ? "" : "s"} due to publish`,
    ...rows
      .slice(0, 10)
      .map((r) => `• [${CHANNEL_LABEL[r.channel] ?? r.channel}] ${r.title} — ${r.publish_date}`),
    rows.length > 10 ? `…and ${rows.length - 10} more` : "",
    CALENDAR_URL,
  ].filter(Boolean);
  // Through the notification router (Z.7.1): the cron runs at 09:00 Saigon
  // time on weekdays, inside working hours, so the reminder goes at once; a
  // Run-now outside working hours is held to the next working morning. One
  // chat reminder per Saigon day: a second run on the same day finds the key
  // claimed (or already queued) and posts nothing more.
  const posted = await notify({
    kind: "revenue.marketing-digest",
    to: { chat: "revenue" },
    message: larkLines.join("\n"),
    dedupeKey: `campaigns:marketing-digest:${today}`,
  });

  // A reminder that reached nobody names the channel that did not take it (Y.20).
  return routineResult({
    status: "ok",
    today,
    due: rows.length,
    emailSent: emailOk,
    notice: posted.status,
    failures: [
      ...(emailOk ? [] : [{ subject: "founder email", step: "email", error: "the reminder email was not sent" }]),
      ...failureOf(posted, "Marketing chat", "notify"),
    ],
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/marketing-digest/", req, handler);
